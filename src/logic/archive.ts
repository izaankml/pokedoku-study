// Past PokeDoku boards, replayed in the Grid tab. The harvest
// (scripts/harvest-pick-stats.ts) archives each finished daily as
// public/archive/<id>.json — PokeDoku's own category spec plus every
// cell's real pick counts — indexed by public/archive/index.json. Both
// are fetched lazily here. A board seen while it was current carries its
// spec and date; one backfilled later has only counts and can't be played.
//
// PokeDoku's spec names three x categories (the columns) and three y
// categories (the rows); cell n of its stats (1-based, row-major) is
// y[⌊(n−1)/3⌋] × x[(n−1) mod 3], matching the Grid's rowIndex*3+colIndex.
// Each spec category maps onto one of the app's categories; a kind the
// app lacks (LEGENDARY_TRIO, an unknown move) makes the board unplayable
// rather than wrong. Verified against every archived board's picks.
import { CATEGORY_BY_ID } from "../data/categories.ts";
import { POKEMON_BY_ID } from "../data/pokedex.ts";
import type { PickArchiveIndex, PickStatsCell, PickStatsPuzzle, Pokemon } from "../data/types.ts";
import type { Grid } from "./grid.ts";
import { normalizeName } from "./matching.ts";
import { appIdFor } from "./uniqueness.ts";

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

// One axis of PokeDoku's spec: the category kind, its value for kinds
// that take one, and the species PokeDoku leaves out of it (Pikachu and
// Eevee from First Partner)
interface SpecCategory {
  type: string;
  obj: string | boolean;
  excludedPokemonIds?: number[];
}

// rows, then columns
const SPEC_AXES = ["y1", "y2", "y3", "x1", "x2", "x3"] as const;

const GENERATION_REGIONS: Record<string, string> = {
  "generation-i": "kanto",
  "generation-ii": "johto",
  "generation-iii": "hoenn",
  "generation-iv": "sinnoh",
  "generation-v": "unova",
  "generation-vi": "kalos",
  "generation-vii": "alola",
  "generation-viii": "galar",
  "generation-ix": "paldea",
};

const EVOLUTION_POSITIONS: Record<string, string> = {
  start: "stage-first",
  middle: "stage-middle",
  final: "stage-final",
  none: "stage-single",
  premature: "stage-notFully",
};

// kinds without a value
const BOOLEAN_KINDS: Record<string, string> = {
  HISUI: "region-hisui",
  DUAL_TYPE: "dual",
  MONOTYPE: "mono",
  LEGENDARY: "flag-legendary",
  MYTHICAL: "flag-mythical",
  ULTRA_BEAST: "flag-ultraBeast",
  PARADOX: "flag-paradox",
  FOSSIL: "flag-fossil",
  FIRST_PARTNER: "flag-starter",
  BABY: "flag-baby",
  MEGA: "flag-mega",
  GMAX: "flag-gmax",
  EVOLUTION_BRANCHED: "branched",
};

// The app category a spec category means, or null for one the app lacks
export function categoryIdFor(spec: SpecCategory): string | null {
  const value = String(spec.obj);
  let id: string | undefined;
  switch (spec.type) {
    case "POKEMON_TYPE":
      id = `type-${value}`;
      break;
    case "GENERATION":
      id = GENERATION_REGIONS[value] && `region-${GENERATION_REGIONS[value]}`;
      break;
    case "EVOLVED_BY":
      id = `evo-${value === "level-up" ? "level" : value}`;
      break;
    case "EVOLUTION_POSITION":
      id = EVOLUTION_POSITIONS[value];
      break;
    case "POKEMON_MOVE":
      id = `move-${normalizeName(value)}`;
      break;
    case "POKEMON_ABILITY":
      id = `ability-${normalizeName(value)}`;
      break;
    default:
      id = BOOLEAN_KINDS[spec.type];
  }
  return id && CATEGORY_BY_ID.has(id) ? id : null;
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
    const category = spec[axis] as SpecCategory | undefined;
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

// The Pokémon PokeDoku's players validly picked in the cell, most picked
// first — the ones this app knows
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
// (its data and this app's differ at the margins), most picked first
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
  return accepted.sort((a, b) => archivedShare(cell, b) - archivedShare(cell, a));
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
