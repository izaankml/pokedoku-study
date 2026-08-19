import { CATEGORIES, getCategory } from "../data/categories.ts";
import type { Category, CategoryGroup } from "../data/categories.ts";
import type { Pokemon } from "../data/types.ts";
import { intersection, pairIsValid } from "./matching.ts";
import { categoryWeight, pickWeighted } from "./picker.ts";
import type { RandomSource } from "./picker.ts";
import type { MergedStats } from "./stats.ts";

export const MIN_CELL = 2;

// A board's categories, three rows by three columns, as category ids.
export interface Grid {
  rows: string[];
  cols: string[];
}

// Which category groups a new grid draws from. Moves and abilities are out
// by default — on PokeDoku they're rare and the rest is what you get
// quizzed on; the Grid tab lets you change the set.
export const DEFAULT_EXCLUDED_GROUPS: CategoryGroup[] = ["move", "ability"];
export function gridPool(excludedGroups: ReadonlyArray<CategoryGroup> = DEFAULT_EXCLUDED_GROUPS): Category[] {
  const excluded = new Set<CategoryGroup>(excludedGroups);
  return CATEGORIES.filter((category) => !excluded.has(category.group));
}
const MAX_TRIES = 300;

// A fallback that is always solvable, should rejection sampling somehow fail.
const KNOWN_GOOD: Grid = {
  rows: ["type-water", "type-flying", "stage-final"],
  cols: ["region-kanto", "mono", "dual"],
};

// Cheap check that 9 DISTINCT Pokémon can fill the board: fill the
// tightest cells first, always taking an unused member.
function hasDistinctSolution(rows: string[], cols: string[]): boolean {
  const cells: Pokemon[][] = [];
  for (const row of rows) {
    for (const col of cols) cells.push(intersection(row, col));
  }
  cells.sort((a, b) => a.length - b.length);
  const used = new Set<number>();
  for (const members of cells) {
    const pick = members.find((pokemon) => !used.has(pokemon.id));
    if (!pick) return false;
    used.add(pick.id);
  }
  return true;
}

function pickDistinct(pool: Category[], count: number, merged: MergedStats, random: RandomSource): Category[] {
  const picked: Category[] = [];
  const remaining = [...pool];
  while (picked.length < count && remaining.length) {
    const category = pickWeighted(remaining, (candidate) => categoryWeight(candidate, merged), random);
    picked.push(category);
    remaining.splice(remaining.indexOf(category), 1);
  }
  return picked;
}

export interface GenerateGridOptions {
  random?: RandomSource;
  // the categories rows and columns may be drawn from
  pool?: Category[];
}

export function generateGrid(
  merged: MergedStats,
  { random = Math.random, pool = gridPool() }: GenerateGridOptions = {},
): Grid {
  for (const min of [MIN_CELL, 1]) {
    for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
      const rows = pickDistinct(pool, 3, merged, random);
      const rowIds = new Set(rows.map((row) => row.id));
      const cols: Category[] = [];
      const candidates = pickDistinct(
        pool.filter((category) => !rowIds.has(category.id)),
        pool.length,
        merged,
        random,
      );
      for (const candidate of candidates) {
        if (rows.every((row) => pairIsValid(row.id, candidate.id, min))) {
          cols.push(candidate);
          if (cols.length === 3) break;
        }
      }
      if (cols.length !== 3) continue;
      const rowIdList = rows.map((row) => row.id);
      const colIdList = cols.map((col) => col.id);
      if (hasDistinctSolution(rowIdList, colIdList)) {
        return { rows: rowIdList, cols: colIdList };
      }
    }
  }
  return { ...KNOWN_GOOD };
}

export interface GridCell {
  row: Category;
  col: Category;
  answers: Pokemon[];
}

export function gridCells({ rows, cols }: Grid): GridCell[] {
  return rows.flatMap((row) =>
    cols.map((col) => ({
      row: getCategory(row),
      col: getCategory(col),
      answers: intersection(row, col),
    })),
  );
}
