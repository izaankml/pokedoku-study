// Harvests PokeDoku's global pick statistics into src/data/pick-stats.json.
//
// A guest session (see pokedoku-session.ts) can read, for any puzzle id,
// how many players picked each Pokémon in each cell — no puzzle play
// required, and the endpoint is read-only (never touch /solution: GETting
// it CREATES a play record for the session's temp user).
//
//   node scripts/harvest-pick-stats.ts                  # daily: finished
//     puzzles since the last run are folded into the prior, and today's
//     spec + live counts land in `recent`
//   node scripts/harvest-pick-stats.ts --backfill 1 1563  # one-off: fold
//     a range of past puzzles into the prior (stats only — past specs
//     aren't readable, so these add no `recent` entries)
//
// The current (still-running) puzzle is never counted into the prior;
// its numbers keep moving all day. It is re-fetched as finished on the
// next daily run.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PickStatsCell, PickStatsData, PickStatsPuzzle } from "../src/data/types.ts";
import { DATA_DIR } from "./pokedoku-api.ts";
import { PokedokuSession } from "./pokedoku-session.ts";

const STATS_PATH = join(DATA_DIR, "pick-stats.json");
// polite gap between backfill requests; the daily run makes only a handful
const THROTTLE_MS = 150;
// how many finished puzzles a daily run looks back over (covers missed days)
const DAILY_LOOKBACK = 7;
const RECENT_KEPT = 3;

interface AnswerAggregate {
  aggCount: number;
  cellNum: number;
  pokemonId: number;
  invalid: boolean;
}
interface PuzzleStats {
  puzzleId: number;
  answerStats: Record<string, { answerAggregates: Record<string, AnswerAggregate> }>;
}
interface CurrentPuzzle extends Record<string, unknown> {
  id: number;
  date: string;
}

function loadStats(): PickStatsData {
  try {
    return JSON.parse(readFileSync(STATS_PATH, "utf8")) as PickStatsData;
  } catch {
    return {
      meta: { generatedAt: "", puzzlesCounted: 0, cellsCounted: 0 },
      counted: [],
      prior: {},
      recent: [],
    };
  }
}

const isCounted = (data: PickStatsData, id: number): boolean =>
  data.counted.some(([from, to]) => id >= from && id <= to);

function markCounted(data: PickStatsData, id: number): void {
  data.counted.push([id, id]);
  data.counted.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [from, to] of data.counted) {
    const last = merged[merged.length - 1];
    if (last && from <= last[1] + 1) last[1] = Math.max(last[1], to);
    else merged.push([from, to]);
  }
  data.counted = merged;
}

// One puzzle's valid picks, per cell (cellNum is 1-based in the API)
function cellAggregates(stats: PuzzleStats): PickStatsCell[] {
  return Array.from({ length: 9 }, (_, cellIndex) => {
    const aggregates = Object.values(stats.answerStats?.[String(cellIndex + 1)]?.answerAggregates ?? {});
    const picks = aggregates
      .filter((aggregate) => !aggregate.invalid && aggregate.aggCount > 0)
      .map((aggregate): [number, number] => [aggregate.pokemonId, aggregate.aggCount])
      .sort((a, b) => b[1] - a[1]);
    return { total: picks.reduce((sum, [, count]) => sum + count, 0), picks };
  });
}

// Stats age out: after ~5 days each cell collapses to a single aggregate
// (one Pokémon at 100% share), which would poison the prior's mean
// shares. A real finished daily has dozens-to-hundreds of distinct picks
// per cell, so a sparse cell is aged data — never fold it in.
const MIN_DISTINCT_PICKS = 5;

function ingest(data: PickStatsData, stats: PuzzleStats): void {
  let cellsIngested = 0;
  for (const cell of cellAggregates(stats)) {
    if (cell.total === 0 || cell.picks.length < MIN_DISTINCT_PICKS) continue;
    for (const [pokemonId, count] of cell.picks) {
      const entry = data.prior[pokemonId] ?? [0, 0];
      entry[0] += 1;
      entry[1] += count / cell.total;
      data.prior[pokemonId] = entry;
    }
    cellsIngested += 1;
  }
  data.meta.cellsCounted += cellsIngested;
  if (cellsIngested > 0) data.meta.puzzlesCounted += 1;
}

function save(data: PickStatsData): void {
  data.meta.generatedAt = new Date().toISOString();
  for (const entry of Object.values(data.prior)) entry[1] = Number(entry[1].toFixed(5));
  writeFileSync(STATS_PATH, JSON.stringify(data));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchStats(session: PokedokuSession, id: number): Promise<PuzzleStats | null> {
  try {
    return await session.apiGet<PuzzleStats>(`/api/puzzle/stats/${id}`);
  } catch (error) {
    console.warn(`puzzle ${id}: ${String(error)} — skipped`);
    return null;
  }
}

const data = loadStats();
const session = new PokedokuSession();
await session.signInAnon();

const backfillFlag = process.argv.indexOf("--backfill");
if (backfillFlag !== -1) {
  const from = Number(process.argv[backfillFlag + 1]);
  const to = Number(process.argv[backfillFlag + 2]);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) {
    console.error("usage: node scripts/harvest-pick-stats.ts --backfill <fromId> <toId>");
    process.exit(1);
  }
  const current = await session.apiGet<CurrentPuzzle>("/api/puzzle/current");
  let done = 0;
  for (let id = from; id <= Math.min(to, current.id - 1); id++) {
    if (isCounted(data, id)) continue;
    const stats = await fetchStats(session, id);
    if (stats) ingest(data, stats);
    markCounted(data, id); // even a failed id: don't hammer it again daily
    done += 1;
    if (done % 100 === 0) {
      save(data);
      console.log(`…${id} (${done} fetched, ${data.meta.cellsCounted} cells counted)`);
    }
    await sleep(THROTTLE_MS);
  }
  save(data);
  console.log(`backfill done: ${data.meta.puzzlesCounted} puzzles, ${data.meta.cellsCounted} cells in the prior`);
} else {
  const current = await session.apiGet<CurrentPuzzle>("/api/puzzle/current");

  for (let id = Math.max(1, current.id - DAILY_LOOKBACK); id < current.id; id++) {
    if (isCounted(data, id)) continue;
    const stats = await fetchStats(session, id);
    if (stats) {
      ingest(data, stats);
      // a recent entry harvested while this puzzle ran gets its final counts
      const recent = data.recent.find((puzzle) => puzzle.id === id);
      if (recent) recent.cells = cellAggregates(stats);
    }
    markCounted(data, id);
    await sleep(THROTTLE_MS);
  }

  // today's board: spec (only readable while current) + live counts
  const todayStats = await fetchStats(session, current.id);
  const { id, date, ...spec } = current;
  const today: PickStatsPuzzle = {
    id,
    date,
    spec,
    cells: todayStats ? cellAggregates(todayStats) : [],
  };
  data.recent = [...data.recent.filter((puzzle) => puzzle.id !== id), today]
    .sort((a, b) => b.id - a.id)
    .slice(0, RECENT_KEPT);

  save(data);
  console.log(
    `harvested through puzzle ${current.id} (${date}): ` +
      `${data.meta.puzzlesCounted} puzzles, ${data.meta.cellsCounted} cells in the prior`,
  );
}
