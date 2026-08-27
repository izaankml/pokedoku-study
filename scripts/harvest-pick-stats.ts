// Harvests PokeDoku's global pick statistics.
//
// A guest session (see pokedoku-session.ts) can read, for any puzzle id,
// how many players picked each Pokémon in each cell — no puzzle play
// required, and the endpoint is read-only (never touch /solution: GETting
// it CREATES a play record for the session's temp user).
//
// Two outputs:
//   - src/data/pick-stats.json — the bounded per-Pokémon prior the app
//     bundles (one small entry per Pokémon, never grows past the dex)
//   - public/archive/<id>.json — the permanent archive: one file per
//     puzzle with its category spec (readable only while current) and
//     full per-cell pick counts, indexed by public/archive/index.json.
//     Deployed with the site but fetched lazily, so the app bundle
//     stays fixed while the archive grows.
//
//   node scripts/harvest-pick-stats.ts                  # daily: finished
//     puzzles since the last run are folded into the prior and archived
//     with their final counts; today's spec + live counts are archived
//   node scripts/harvest-pick-stats.ts --backfill 1 1563  # one-off: fold
//     a range of past puzzles into the prior and archive
//   node scripts/harvest-pick-stats.ts --mirror-all     # push every
//     archive file to Firestore (first-time seed, or repair after
//     mirror failures); needs FIREBASE_SERVICE_ACCOUNT
//
// Archives touched by a run are also mirrored to Firestore
// (firestore-archive.ts) when FIREBASE_SERVICE_ACCOUNT is set; mirror
// failures only warn — the files are canonical and --mirror-all repairs.
//
// The current (still-running) puzzle is never counted into the prior;
// its numbers keep moving all day. It is re-fetched as finished on the
// next daily run.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PickArchiveIndex, PickStatsCell, PickStatsData, PickStatsPuzzle } from "../src/data/types.ts";
import { FirestoreArchive } from "./firestore-archive.ts";
import { DATA_DIR } from "./pokedoku-api.ts";
import { PokedokuSession } from "./pokedoku-session.ts";

const STATS_PATH = join(DATA_DIR, "pick-stats.json");
const ARCHIVE_DIR = join(DATA_DIR, "..", "..", "public", "archive");
// polite gap between backfill requests; the daily run makes only a handful
const THROTTLE_MS = 150;
// how many finished puzzles a daily run looks back over (covers missed days)
const DAILY_LOOKBACK = 7;
// recent finished puzzles get their archive refreshed to final counts even
// when already counted (a puzzle archived live keeps growing for a day)
const ARCHIVE_REFRESH = 5;

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
    const parsed = JSON.parse(readFileSync(STATS_PATH, "utf8")) as PickStatsData & { recent?: unknown };
    delete parsed.recent; // pre-archive files carried the last boards inline
    return parsed;
  } catch {
    return {
      meta: { generatedAt: "", puzzlesCounted: 0, cellsCounted: 0 },
      counted: [],
      prior: {},
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
// shares and is worthless as an archive. A real finished daily has
// dozens-to-hundreds of distinct picks per cell, so a sparse cell is
// aged data — never fold it in, never archive it.
const MIN_DISTINCT_PICKS = 5;

const hasFullCell = (cells: PickStatsCell[]): boolean =>
  cells.some((cell) => cell.picks.length >= MIN_DISTINCT_PICKS);

function ingest(data: PickStatsData, cells: PickStatsCell[]): void {
  let cellsIngested = 0;
  for (const cell of cells) {
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

// archives written or refreshed by this run, mirrored to Firestore at the end
const touchedArchives: PickStatsPuzzle[] = [];

// Merge into the puzzle's archive file: counts refresh, but the spec and
// date (readable only while the puzzle was current) are never dropped
function writeArchive(puzzle: PickStatsPuzzle): void {
  mkdirSync(ARCHIVE_DIR, { recursive: true });
  const path = join(ARCHIVE_DIR, `${puzzle.id}.json`);
  let existing: Partial<PickStatsPuzzle> = {};
  try {
    existing = JSON.parse(readFileSync(path, "utf8")) as PickStatsPuzzle;
  } catch {
    // first archive of this puzzle
  }
  const merged: PickStatsPuzzle = {
    id: puzzle.id,
    cells: hasFullCell(puzzle.cells) ? puzzle.cells : (existing.cells ?? puzzle.cells),
  };
  const date = puzzle.date ?? existing.date;
  const spec = puzzle.spec ?? existing.spec;
  if (date) merged.date = date;
  if (spec) merged.spec = spec;
  writeFileSync(path, JSON.stringify(merged));
  touchedArchives.push(merged);
}

async function mirrorArchives(puzzles: PickStatsPuzzle[]): Promise<void> {
  if (puzzles.length === 0) return;
  let firestore: FirestoreArchive | null;
  try {
    firestore = await FirestoreArchive.fromEnv();
  } catch (error) {
    console.warn(`Firestore mirror unavailable: ${String(error)}`);
    return;
  }
  if (!firestore) return; // no FIREBASE_SERVICE_ACCOUNT — mirroring stays dark
  for (const puzzle of puzzles) {
    try {
      await firestore.mirror(puzzle);
    } catch (error) {
      console.warn(String(error)); // files are canonical; --mirror-all repairs
    }
  }
  console.log(`mirrored ${puzzles.length} puzzle${puzzles.length === 1 ? "" : "s"} to Firestore`);
}

function readAllArchives(): PickStatsPuzzle[] {
  return readdirSync(ARCHIVE_DIR)
    .filter((name) => /^\d+\.json$/.test(name))
    .map((name) => JSON.parse(readFileSync(join(ARCHIVE_DIR, name), "utf8")) as PickStatsPuzzle);
}

function rebuildIndex(): void {
  mkdirSync(ARCHIVE_DIR, { recursive: true });
  const entries: PickArchiveIndex = readdirSync(ARCHIVE_DIR)
    .filter((name) => /^\d+\.json$/.test(name))
    .map((name) => {
      const puzzle = JSON.parse(readFileSync(join(ARCHIVE_DIR, name), "utf8")) as PickStatsPuzzle;
      return { id: puzzle.id, ...(puzzle.date ? { date: puzzle.date } : {}) };
    })
    .sort((a, b) => b.id - a.id);
  writeFileSync(join(ARCHIVE_DIR, "index.json"), JSON.stringify(entries));
}

function save(data: PickStatsData): void {
  data.meta.generatedAt = new Date().toISOString();
  for (const entry of Object.values(data.prior)) entry[1] = Number(entry[1].toFixed(5));
  writeFileSync(STATS_PATH, JSON.stringify(data));
  rebuildIndex();
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

if (process.argv.includes("--mirror-all")) {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.error("--mirror-all needs FIREBASE_SERVICE_ACCOUNT set");
    process.exit(1);
  }
  await mirrorArchives(readAllArchives());
  process.exit(0);
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
    if (stats) {
      const cells = cellAggregates(stats);
      ingest(data, cells);
      if (hasFullCell(cells)) writeArchive({ id, cells });
    }
    markCounted(data, id); // even a failed id: don't hammer it again daily
    done += 1;
    if (done % 100 === 0) {
      save(data);
      console.log(`…${id} (${done} fetched, ${data.meta.cellsCounted} cells counted)`);
    }
    await sleep(THROTTLE_MS);
  }
  save(data);
  await mirrorArchives(touchedArchives);
  console.log(`backfill done: ${data.meta.puzzlesCounted} puzzles, ${data.meta.cellsCounted} cells in the prior`);
} else {
  const current = await session.apiGet<CurrentPuzzle>("/api/puzzle/current");

  for (let id = Math.max(1, current.id - DAILY_LOOKBACK); id < current.id; id++) {
    const needsIngest = !isCounted(data, id);
    const needsRefresh = id >= current.id - ARCHIVE_REFRESH;
    if (!needsIngest && !needsRefresh) continue;
    const stats = await fetchStats(session, id);
    if (stats) {
      const cells = cellAggregates(stats);
      if (needsIngest) ingest(data, cells);
      if (hasFullCell(cells)) writeArchive({ id, cells });
    }
    if (needsIngest) markCounted(data, id);
    await sleep(THROTTLE_MS);
  }

  // today's board: spec (only readable while current) + live counts
  const todayStats = await fetchStats(session, current.id);
  const { id, date, ...spec } = current;
  writeArchive({ id, date, spec, cells: todayStats ? cellAggregates(todayStats) : [] });

  save(data);
  await mirrorArchives(touchedArchives);
  console.log(
    `harvested through puzzle ${current.id} (${date}): ` +
      `${data.meta.puzzlesCounted} puzzles, ${data.meta.cellsCounted} cells in the prior`,
  );
}
