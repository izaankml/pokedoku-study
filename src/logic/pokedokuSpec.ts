// PokeDoku's category spec (its API's own JSON, kept verbatim in each
// archived board) mapped onto this app's categories. Shared by the Grid's
// replay and the harvest script, so it must stay free of browser globals.
//
// A spec names three x categories (the columns) and three y categories
// (the rows); cell n of PokeDoku's stats (1-based, row-major) is
// y[⌊(n−1)/3⌋] × x[(n−1) mod 3], matching the Grid's rowIndex*3+colIndex.
// A kind the app lacks (LEGENDARY_TRIO, an unknown move) maps to null.
import { CATEGORY_BY_ID } from "../data/categories.ts";
import { normalizeName } from "./matching.ts";

// One axis of the spec: the category kind, its value for kinds that take
// one, and the species PokeDoku leaves out of it (Pikachu and Eevee from
// First Partner)
export interface SpecCategory {
  type: string;
  obj: string | boolean;
  excludedPokemonIds?: number[];
}

// rows, then columns
export const SPEC_AXES = ["y1", "y2", "y3", "x1", "x2", "x3"] as const;

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

// The spec's category on one axis, if it has one
export const specAxis = (spec: Record<string, unknown>, axis: (typeof SPEC_AXES)[number]): SpecCategory | undefined =>
  spec[axis] as SpecCategory | undefined;

// The app category ids (row, then column) of cell `index` (0–8, row-major)
// of a board with this spec, or null when either is a kind the app lacks
export function specCellPair(spec: Record<string, unknown>, index: number): [string, string] | null {
  const row = specAxis(spec, SPEC_AXES[Math.floor(index / 3)]);
  const col = specAxis(spec, SPEC_AXES[3 + (index % 3)]);
  const rowId = row ? categoryIdFor(row) : null;
  const colId = col ? categoryIdFor(col) : null;
  return rowId && colId ? [rowId, colId] : null;
}
