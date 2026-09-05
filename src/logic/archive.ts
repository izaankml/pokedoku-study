// Past PokeDoku boards, replayed in the Grid tab. The harvest archives
// each finished daily as public/archive/<id>.json (its category spec and
// every cell's pick counts), indexed by index.json, and sums picks per
// category pair into pairs.json. All are fetched lazily here. A board
// backfilled after its day has only counts and can't be played; a spec
// kind the app lacks makes a board unplayable rather than wrong.
import { POKEMON_BY_ID } from "../data/pokedex.ts";
import type { PairStatsData, PickArchiveIndex, PickStatsCell, PickStatsPuzzle, Pokemon } from "../data/types.ts";
import type { Grid } from "./grid.ts";
import { SPEC_AXES, categoryIdFor, specAxis } from "./pokedokuSpec.ts";
import { appIdFor } from "./uniqueness.ts";

export { categoryIdFor } from "./pokedokuSpec.ts";

const ARCHIVE_URL = `${import.meta.env.BASE_URL}archive/`;

export async function fetchArchiveIndex(): Promise<PickArchiveIndex> {
  // revalidated each time: a new board lands every morning
  const response = await fetch(`${ARCHIVE_URL}index.json`, { cache: "no-cache" });
  if (!response.ok) throw new Error(`archive index: HTTP ${response.status}`);
  return (await response.json()) as PickArchiveIndex;
}

export async function fetchArchivedPuzzle(id: number): Promise<PickStatsPuzzle> {
  const response = await fetch(`${ARCHIVE_URL}${id}.json`);
  if (!response.ok) throw new Error(`archive ${id}: HTTP ${response.status}`);
  return (await response.json()) as PickStatsPuzzle;
}

// The per-pair table: every category pair PokeDoku has run, with its
// players' picks summed over the archived boards that had it. A random
// grid's cell shows these in place of an estimate. Revalidated each time,
// like the index.
export async function fetchPairStats(): Promise<PairStatsData> {
  const response = await fetch(`${ARCHIVE_URL}pairs.json`, { cache: "no-cache" });
  if (!response.ok) throw new Error(`pair stats: HTTP ${response.status}`);
  return (await response.json()) as PairStatsData;
}

export interface ArchivedBoard {
  id: number;
  date: string;
  grid: Grid;
  // per cell, the species its row and column categories leave out
  excluded: Set<number>[];
  cells: PickStatsCell[];
  // as fetched, so the board in progress can be stored and rebuilt
  puzzle: PickStatsPuzzle;
}

export type ArchiveLoad = { board: ArchivedBoard } | { unplayable: string };

export function boardFromArchive(puzzle: PickStatsPuzzle): ArchiveLoad {
  const { spec, date } = puzzle;
  if (!spec || !date) return { unplayable: "This board was archived after its day, without its categories." };
  if (puzzle.cells.length !== 9) return { unplayable: "This board's pick counts are incomplete." };
  const ids: string[] = [];
  const excludedByAxis: Set<number>[] = [];
  for (const axis of SPEC_AXES) {
    const category = specAxis(spec, axis);
    const id = category ? categoryIdFor(category) : null;
    if (!category || !id) {
      const kind = category ? `${category.type}${typeof category.obj === "string" ? ` ${category.obj}` : ""}` : axis;
      return { unplayable: `PokeDoku's "${kind}" isn't a category here yet.` };
    }
    ids.push(id);
    excludedByAxis.push(new Set(category.excludedPokemonIds ?? []));
  }
  const rows = ids.slice(0, 3);
  const cols = ids.slice(3);
  const excluded = Array.from({ length: 9 }, (_, index) => {
    const row = excludedByAxis[Math.floor(index / 3)];
    const col = excludedByAxis[3 + (index % 3)];
    return new Set([...row, ...col]);
  });
  return { board: { id: puzzle.id, date, grid: { rows, cols }, excluded, cells: puzzle.cells, puzzle } };
}

// The share of the cell's picks that went to this Pokémon, 0–100
export function archivedShare(cell: PickStatsCell, pokemon: Pokemon): number {
  if (cell.total === 0) return 0;
  const count = cell.picks.reduce((sum, [id, picks]) => (appIdFor(id) === pokemon.id ? sum + picks : sum), 0);
  return (100 * count) / cell.total;
}

// The Pokémon PokeDoku's players validly picked in the cell that this app
// knows, most picked first
export function archivedPicks(cell: PickStatsCell): Pokemon[] {
  const seen = new Set<number>();
  return cell.picks.flatMap(([id]) => {
    const pokemon = POKEMON_BY_ID.get(appIdFor(id));
    if (!pokemon || seen.has(pokemon.id)) return [];
    seen.add(pokemon.id);
    return [pokemon];
  });
}

// What a replayed cell accepts: the app's own answers less PokeDoku's
// exclusions, plus whatever PokeDoku accepted from its players that day
// (its data and this app's differ at the margins), least picked first
export function archivedAnswers(board: ArchivedBoard, index: number, appAnswers: Pokemon[]): Pokemon[] {
  const excluded = board.excluded[index];
  const cell = board.cells[index];
  const accepted = appAnswers.filter((pokemon) => !excluded.has(pokemon.species) && !excluded.has(pokemon.id));
  const seen = new Set(accepted.map((pokemon) => pokemon.id));
  for (const pokemon of archivedPicks(cell)) {
    if (!seen.has(pokemon.id)) {
      accepted.push(pokemon);
      seen.add(pokemon.id);
    }
  }
  return accepted.sort((a, b) => archivedShare(cell, a) - archivedShare(cell, b));
}

// "Mon 1 Sep 2026" for "2026-09-01", as a calendar date (no timezone shift)
export function formatArchiveDate(date: string, style: "long" | "short" = "long"): string {
  const [year, month, day] = date.split("-").map(Number);
  const calendarDate = new Date(year, month - 1, day);
  return calendarDate.toLocaleDateString(
    undefined,
    style === "long"
      ? { weekday: "short", day: "numeric", month: "short", year: "numeric" }
      : { day: "numeric", month: "short" },
  );
}
