// Harvests PokeDoku's global pick statistics.
//
// A guest session (see pokedoku-session.ts) can read, for any puzzle id,
// how many players picked each Pokémon in each cell — no puzzle play
// required, and the endpoint is read-only (never touch /solution: GETting
// it CREATES a play record for the session's temp user).
//
// Two outputs:
//   - src/data/pick-stats.json — the bounded per-Pokémon prior the app
//     bundles (one small entry per Pokémon, never grows past the dex),
//     plus the harvest's own bookkeeping: which ids are counted, which
//     boards are pending
//   - public/archive/<id>.json — the permanent archive: one file per
//     finished puzzle with its category spec and full per-cell pick
//     counts, indexed by public/archive/index.json. Deployed with the
//     site but fetched lazily, so the app bundle stays fixed while the
//     archive grows.
//
// PokeDoku schedules each day's puzzle from a pool of pre-generated ones,
// so ids are not in date order (1528 ran on 2026-08-28, 1614 the next
// day, 1507 three days after that) and nothing about an id says when, or
// whether, it was played. The only way to know which puzzle just finished
// is to have seen it while it was current. So the daily run notes the
// current board — id, date and spec, readable only while current — as
// pending, and on the first run after it has rotated out (new puzzles at
// midnight US Eastern) archives it with its final counts and folds it
// into the prior. A board is never archived while it is still being
// played: its counts keep moving all day.
//
//   node scripts/harvest-pick-stats.ts                  # daily
//   node scripts/harvest-pick-stats.ts --backfill 1 1563  # one-off: fold
//     a range of past ids into the prior and archive them (without spec
//     or date, which were only readable while each was current)
//   node scripts/harvest-pick-stats.ts --mirror-all     # push every
//     archive file to Firestore (first-time seed, or repair after
//     mirror failures); needs FIREBASE_SERVICE_ACCOUNT
//
// Archives touched by a run are also mirrored to Firestore
// (firestore-archive.ts) when FIREBASE_SERVICE_ACCOUNT is set; mirror
// failures only warn — the files are canonical and --mirror-all repairs.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  PendingPuzzle,
  PickArchiveIndex,
  PickStatsCell,
  PickStatsData,
  PickStatsPuzzle,
} from "../src/data/types.ts";
import { FirestoreArchive } from "./firestore-archive.ts";
import { DATA_DIR } from "./pokedoku-api.ts";
import { PokedokuSession } from "./pokedoku-session.ts";

const STATS_PATH = join(DATA_DIR, "pick-stats.json");
const ARCHIVE_DIR = join(DATA_DIR, "..", "..", "public", "archive");
// polite gap between requests; the daily run makes only a handful
const THROTTLE_MS = 150;
// A finished daily has tens of thousands of valid picks per cell; a stray
// play of an id that was never scheduled has a handful. Cells under the
// floor are neither counted nor archived. The floor is on picks, not on
// distinct Pokémon: a cell with two valid answers legitimately shows two.
const MIN_CELL_PICKS = 1000;

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
    const parsed = JSON.parse(readFileSync(STATS_PATH, "utf8")) as Omit<PickStatsData, "pending"> & {
      recent?: unknown;
      pending?: PendingPuzzle[];
    };
    delete parsed.recent; // pre-archive files carried the last boards inline
    return { ...parsed, pending: parsed.pending ?? [] };
  } catch {
    return {
      meta: { generatedAt: "", puzzlesCounted: 0, cellsCounted: 0 },
      counted: [],
      pending: [],
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

const hasFinishedCell = (cells: PickStatsCell[]): boolean =>
  cells.some((cell) => cell.total >= MIN_CELL_PICKS);

function ingest(data: PickStatsData, cells: PickStatsCell[]): void {
  let cellsIngested = 0;
  for (const cell of cells) {
    if (cell.total < MIN_CELL_PICKS) continue;
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

// archives written by this run, mirrored to Firestore at the end
const touchedArchives: PickStatsPuzzle[] = [];

// Write the puzzle's archive file. A backfilled board carries no spec or
// date; if an earlier archive of it had them, they are kept.
function writeArchive(puzzle: PickStatsPuzzle): void {
  mkdirSync(ARCHIVE_DIR, { recursive: true });
  const path = join(ARCHIVE_DIR, `${puzzle.id}.json`);
  let existing: Partial<PickStatsPuzzle> = {};
  try {
    existing = JSON.parse(readFileSync(path, "utf8")) as PickStatsPuzzle;
  } catch {
    // first archive of this puzzle
  }
  const merged: PickStatsPuzzle = { id: puzzle.id, cells: puzzle.cells };
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
  const entries: PickArchiveIndex = readAllArchives()
    .map((puzzle) => ({ id: puzzle.id, ...(puzzle.date ? { date: puzzle.date } : {}) }))
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
const current = await session.apiGet<CurrentPuzzle>("/api/puzzle/current");

const backfillFlag = process.argv.indexOf("--backfill");
if (backfillFlag !== -1) {
  const from = Number(process.argv[backfillFlag + 1]);
  const to = Number(process.argv[backfillFlag + 2]);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) {
    console.error("usage: node scripts/harvest-pick-stats.ts --backfill <fromId> <toId>");
    process.exit(1);
  }
  // still being played, or awaiting its first run after rotating out
  const unfinished = new Set([current.id, ...data.pending.map((pending) => pending.id)]);
  let fetched = 0;
  for (let id = from; id <= to; id++) {
    if (isCounted(data, id) || unfinished.has(id)) continue;
    const stats = await fetchStats(session, id);
    // an id with no finished stats stays uncounted: it may be scheduled
    // as a daily later, and the daily run never probes ids by itself
    if (stats) {
      const cells = cellAggregates(stats);
      if (hasFinishedCell(cells)) {
        ingest(data, cells);
        markCounted(data, id);
        writeArchive({ id, cells });
      }
    }
    fetched += 1;
    if (fetched % 100 === 0) {
      save(data);
      console.log(`…${id} (${fetched} fetched, ${data.meta.cellsCounted} cells counted)`);
    }
    await sleep(THROTTLE_MS);
  }
  save(data);
  await mirrorArchives(touchedArchives);
  console.log(`backfill done: ${data.meta.puzzlesCounted} puzzles, ${data.meta.cellsCounted} cells in the prior`);
} else {
  const { id: currentId, date: currentDate, ...currentSpec } = current;

  // every pending board that has rotated out is finished: archive it with
  // its final counts and fold it into the prior
  const stillPending: PendingPuzzle[] = [];
  for (const pending of data.pending) {
    if (pending.id === currentId) {
      stillPending.push(pending);
      continue;
    }
    const stats = await fetchStats(session, pending.id);
    const cells = stats ? cellAggregates(stats) : [];
    if (!hasFinishedCell(cells)) {
      console.warn(`puzzle ${pending.id} (${pending.date}): no finished stats yet — still pending`);
      stillPending.push(pending);
      continue;
    }
    if (!isCounted(data, pending.id)) {
      ingest(data, cells);
      markCounted(data, pending.id);
    }
    writeArchive({ ...pending, cells });
    console.log(`archived puzzle ${pending.id} (${pending.date})`);
    await sleep(THROTTLE_MS);
  }
  data.pending = stillPending;

  // today's board: note its id, date and spec (readable only while
  // current) so the first run after it rotates out can archive it
  if (!data.pending.some((pending) => pending.id === currentId)) {
    data.pending.push({ id: currentId, date: currentDate, spec: currentSpec });
  }

  save(data);
  await mirrorArchives(touchedArchives);
  console.log(
    `puzzle ${currentId} (${currentDate}) is current and pending; ` +
      `${data.meta.puzzlesCounted} puzzles, ${data.meta.cellsCounted} cells in the prior`,
  );
}
