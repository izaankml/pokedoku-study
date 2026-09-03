// Harvests PokeDoku's global pick statistics.
//
// A guest session (see pokedoku-session.ts) can read, for any puzzle id,
// how many players picked each Pokémon in each cell — no puzzle play
// required, and the endpoint is read-only (never touch /solution: GETting
// it CREATES a play record for the session's temp user).
//
// The archive is the record: public/archive/<id>.json holds one finished
// puzzle — its category spec and full per-cell pick counts — indexed by
// public/archive/index.json. It is deployed with the site but fetched
// lazily, so the app bundle stays fixed while the archive grows. Two
// things are derived from the archive on every save: the prior the app
// bundles, src/data/pick-stats.json — one small entry per Pokémon (never
// grows past the dex) plus the harvest's bookkeeping — and the per-pair
// table, public/archive/pairs.json (src/logic/pairStats.ts): every
// category pair PokeDoku has run, with its players' picks summed over
// the boards that had it, fetched lazily by the Grid tab for random
// grids. Nothing outside the archive is in either.
//
// PokeDoku schedules each day's puzzle from a pool of pre-generated ones,
// so ids are not in date order (1528 ran on 2026-08-28, 1614 the next
// day, 1507 three days after that) and nothing about an id says when, or
// whether, it was played. The only way to know which puzzle just finished
// is to have seen it while it was current. So the daily run notes the
// current board — id, date and spec, readable only while current — as
// pending, and on the first run after it has rotated out (new puzzles at
// midnight US Eastern) archives it with its final counts. A board is
// never archived while it is still being played: its counts keep moving
// all day.
//
// PokeDoku only serves stats for roughly the last month of dailies (1562
// had full stats on 2026-08-26 and a 400 a week later), so a backfill can
// only reach what is still served; the archive is the long-term record.
//
//   node scripts/harvest-pick-stats.ts                  # daily
//   node scripts/harvest-pick-stats.ts --backfill 1 1700  # sweep a range
//     of ids for finished dailies not yet archived (without spec or
//     date, which were only readable while each was current)
//   node scripts/harvest-pick-stats.ts --mirror-all     # push every
//     archive file to Firestore (first-time seed, or repair after
//     mirror failures); needs FIREBASE_SERVICE_ACCOUNT
//   node scripts/harvest-pick-stats.ts --rebuild        # rederive the
//     prior, index and pair table from the archive on disk, no network
//     (after changing how any of them is derived)
//   POKEDOKU_SESSION_TOKEN=… node scripts/harvest-pick-stats.ts \
//       --specs 2026-07-25 2026-09-01                  # give backfilled
//     boards their categories: PokeDoku shows a signed-in user any past
//     day's puzzle at pokedoku.com/puzzle/<date> (pokedoku-page.ts reads
//     it out of the page), which a guest session is refused. The token
//     is the browser's __Secure-next-auth.session-token cookie, read from
//     the environment for the run and never written anywhere.
//
// Archives written by a run are also mirrored to Firestore
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
import { maxValidInEveryCell } from "../src/logic/matching.ts";
import { buildPairStats } from "../src/logic/pairStats.ts";
import { FirestoreArchive } from "./firestore-archive.ts";
import { DATA_DIR } from "./pokedoku-api.ts";
import { extractEmbeddedPuzzle } from "./pokedoku-page.ts";
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

function readStatsFile(): Partial<PickStatsData> {
  try {
    return JSON.parse(readFileSync(STATS_PATH, "utf8")) as Partial<PickStatsData>;
  } catch {
    return {}; // first run
  }
}

// Only `pending` carries over between runs; the prior and its meta are
// rebuilt from the archive on every save
function loadStats(): PickStatsData {
  return {
    meta: { generatedAt: "", puzzlesCounted: 0, cellsCounted: 0 },
    pending: readStatsFile().pending ?? [],
    prior: {},
  };
}

// everything but the timestamp
const fingerprint = (stats: Partial<PickStatsData>): string =>
  JSON.stringify({ ...stats, meta: { ...stats.meta, generatedAt: undefined } });

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

// A category board's nine cells have different answer pools: a Pokémon
// picked validly in all nine fits all six categories. The dataset says
// how many can (maxValidInEveryCell — 75 as of 2026-09: dual-typed Water
// types that learn Protect, Surf, Ice Beam and Hydro Pump), and the limit
// is twice that: headroom for Pokémon PokeDoku has before the dataset is
// rebuilt for a new generation, and for category definitions that differ
// at the margins. Puzzle 1575 has 575 Pokémon picked in every cell at a
// flat share — an everything-goes pool (PokeDoku's unlimited mode, most
// likely), not a daily — and would swamp the prior with near-zero shares.
// A rejected board stays pending and is retried daily, so a lagging
// dataset delays it rather than losing it.
const MAX_SHARED_BY_ALL_CELLS = 2 * maxValidInEveryCell();

// Finished daily: a day's worth of picks, on a category board
const isFinishedDaily = (cells: PickStatsCell[]): boolean => {
  if (!cells.some((cell) => cell.total >= MIN_CELL_PICKS)) return false;
  const pickedPerCell = cells.map((cell) => new Set(cell.picks.map(([pokemonId]) => pokemonId)));
  const sharedByAll = [...pickedPerCell[0]].filter((pokemonId) =>
    pickedPerCell.every((picked) => picked.has(pokemonId)),
  );
  return sharedByAll.length <= MAX_SHARED_BY_ALL_CELLS;
};

// For each Pokémon: how many archived cells it was picked in, and the sum
// of its share of each of those cells' picks
function rebuildPrior(data: PickStatsData, archives: PickStatsPuzzle[]): void {
  const prior: PickStatsData["prior"] = {};
  let puzzlesCounted = 0;
  let cellsCounted = 0;
  for (const puzzle of archives) {
    let puzzleCells = 0;
    for (const cell of puzzle.cells) {
      if (cell.total < MIN_CELL_PICKS) continue;
      for (const [pokemonId, count] of cell.picks) {
        const entry = prior[pokemonId] ?? [0, 0];
        entry[0] += 1;
        entry[1] += count / cell.total;
        prior[pokemonId] = entry;
      }
      puzzleCells += 1;
    }
    if (puzzleCells > 0) puzzlesCounted += 1;
    cellsCounted += puzzleCells;
  }
  for (const entry of Object.values(prior)) entry[1] = Number(entry[1].toFixed(5));
  data.prior = prior;
  data.meta.puzzlesCounted = puzzlesCounted;
  data.meta.cellsCounted = cellsCounted;
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
  mkdirSync(ARCHIVE_DIR, { recursive: true });
  return readdirSync(ARCHIVE_DIR)
    .filter((name) => /^\d+\.json$/.test(name))
    .map((name) => JSON.parse(readFileSync(join(ARCHIVE_DIR, name), "utf8")) as PickStatsPuzzle);
}

function rebuildIndex(archives: PickStatsPuzzle[]): void {
  const entries: PickArchiveIndex = archives
    .map((puzzle) => ({ id: puzzle.id, ...(puzzle.date ? { date: puzzle.date } : {}) }))
    .sort((a, b) => b.id - a.id);
  writeFileSync(join(ARCHIVE_DIR, "index.json"), JSON.stringify(entries));
}

// The per-pair table (src/logic/pairStats.ts), under the same pick floor
// as the prior; its order is fixed, so an unchanged table is no diff
function rebuildPairs(archives: PickStatsPuzzle[]): void {
  writeFileSync(join(ARCHIVE_DIR, "pairs.json"), JSON.stringify(buildPairStats(archives, MIN_CELL_PICKS)));
}

function save(data: PickStatsData): void {
  const archives = readAllArchives();
  rebuildPrior(data, archives);
  rebuildIndex(archives);
  rebuildPairs(archives);
  // a run that changed nothing leaves no diff, so the second daily slot
  // (and a sweep that found nothing) doesn't commit a fresh timestamp
  if (fingerprint(data) === fingerprint(readStatsFile())) return;
  data.meta.generatedAt = new Date().toISOString();
  writeFileSync(STATS_PATH, JSON.stringify(data));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// null when the API has nothing for the id (a 400: never scheduled, or
// aged out) or fails; `quiet` for sweeps, where that is the common case
async function fetchStats(session: PokedokuSession, id: number, quiet = false): Promise<PuzzleStats | null> {
  try {
    return await session.apiGet<PuzzleStats>(`/api/puzzle/stats/${id}`);
  } catch (error) {
    if (!quiet) console.warn(`puzzle ${id}: ${String(error)} — skipped`);
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

if (process.argv.includes("--rebuild")) {
  const rebuilt = loadStats();
  save(rebuilt);
  console.log(`rebuilt: ${rebuilt.meta.puzzlesCounted} puzzles, ${rebuilt.meta.cellsCounted} cells in the prior`);
  process.exit(0);
}

// every calendar day from `from` to `to`, inclusive
function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  const last = Date.parse(`${to}T00:00:00Z`);
  for (let day = Date.parse(`${from}T00:00:00Z`); day <= last; day += 86_400_000) {
    dates.push(new Date(day).toISOString().slice(0, 10));
  }
  return dates;
}

const specsFlag = process.argv.indexOf("--specs");
if (specsFlag !== -1) {
  const from = process.argv[specsFlag + 1] ?? "";
  const to = process.argv[specsFlag + 2] ?? "";
  const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
  if (!isDate(from) || !isDate(to) || from > to) {
    console.error("usage: POKEDOKU_SESSION_TOKEN=… node scripts/harvest-pick-stats.ts --specs <from> <to>  (YYYY-MM-DD)");
    process.exit(1);
  }
  const token = process.env.POKEDOKU_SESSION_TOKEN;
  if (!token) {
    console.error("--specs needs POKEDOKU_SESSION_TOKEN: a signed-in browser's __Secure-next-auth.session-token cookie");
    process.exit(1);
  }
  const signedIn = new PokedokuSession();
  signedIn.signInWithToken(token);
  const archived = new Map(readAllArchives().map((puzzle) => [puzzle.id, puzzle]));
  let filled = 0;
  for (const date of datesBetween(from, to)) {
    const html = await signedIn.sitePage(`/puzzle/${date}`);
    const puzzle = html ? extractEmbeddedPuzzle(html) : null;
    if (!puzzle) {
      console.warn(`${date}: no puzzle page${html ? "" : " (not signed in, or no puzzle that day)"}`);
      await sleep(THROTTLE_MS);
      continue;
    }
    const existing = archived.get(puzzle.id);
    if (!existing) {
      console.log(`${date}: puzzle ${puzzle.id} isn't archived (its stats were never served) — skipped`);
    } else if (!existing.spec || !existing.date) {
      const { id, date: puzzleDate, ...spec } = puzzle;
      writeArchive({ id, date: puzzleDate, spec, cells: existing.cells });
      console.log(`${date}: puzzle ${id} now has its categories`);
      filled += 1;
    }
    await sleep(THROTTLE_MS);
  }
  save(loadStats());
  await mirrorArchives(touchedArchives);
  console.log(`specs done: ${filled} board${filled === 1 ? "" : "s"} given their categories`);
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
  const archived = new Set(readAllArchives().map((puzzle) => puzzle.id));
  // still being played, or awaiting its first run after rotating out
  const unfinished = new Set([current.id, ...data.pending.map((pending) => pending.id)]);
  let fetched = 0;
  let found = 0;
  for (let id = from; id <= to; id++) {
    if (archived.has(id) || unfinished.has(id)) continue;
    const stats = await fetchStats(session, id, true);
    if (stats) {
      const cells = cellAggregates(stats);
      if (isFinishedDaily(cells)) {
        writeArchive({ id, cells });
        found += 1;
      }
    }
    fetched += 1;
    if (fetched % 100 === 0) {
      save(data);
      console.log(`…${id} (${fetched} fetched, ${found} archived)`);
    }
    await sleep(THROTTLE_MS);
  }
  save(data);
  await mirrorArchives(touchedArchives);
  console.log(
    `backfill done: ${found} new archive${found === 1 ? "" : "s"}; ` +
      `${data.meta.puzzlesCounted} puzzles, ${data.meta.cellsCounted} cells in the prior`,
  );
} else {
  const { id: currentId, date: currentDate, ...currentSpec } = current;

  // every pending board that has rotated out is finished: archive it
  // with its final counts
  const stillPending: PendingPuzzle[] = [];
  for (const pending of data.pending) {
    if (pending.id === currentId) {
      stillPending.push(pending);
      continue;
    }
    const stats = await fetchStats(session, pending.id);
    const cells = stats ? cellAggregates(stats) : [];
    if (!isFinishedDaily(cells)) {
      console.warn(`puzzle ${pending.id} (${pending.date}): no finished stats yet — still pending`);
      stillPending.push(pending);
      continue;
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
