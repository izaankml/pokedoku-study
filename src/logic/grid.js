import { CATEGORIES, getCategory } from "../data/categories.js";
import { intersection, pairIsValid } from "./matching.js";
import { categoryWeight, pickWeighted } from "./picker.js";

export const MIN_CELL = 2;
const MAX_TRIES = 300;

// A fallback that is always solvable, should rejection sampling somehow fail.
const KNOWN_GOOD = {
  rows: ["type-water", "type-flying", "stage-final"],
  cols: ["region-kanto", "mono", "dual"],
};

// Cheap check that 9 DISTINCT Pokémon can fill the board: fill the
// tightest cells first, always taking an unused member.
function hasDistinctSolution(rows, cols) {
  const cells = [];
  for (const r of rows) {
    for (const c of cols) cells.push(intersection(r, c));
  }
  cells.sort((a, b) => a.length - b.length);
  const used = new Set();
  for (const members of cells) {
    const pick = members.find((p) => !used.has(p.id));
    if (!pick) return false;
    used.add(pick.id);
  }
  return true;
}

function pickDistinct(pool, n, merged, random) {
  const picked = [];
  const remaining = [...pool];
  while (picked.length < n && remaining.length) {
    const cat = pickWeighted(remaining, (c) => categoryWeight(c, merged), random);
    picked.push(cat);
    remaining.splice(remaining.indexOf(cat), 1);
  }
  return picked;
}

export function generateGrid(merged, { random = Math.random } = {}) {
  for (const min of [MIN_CELL, 1]) {
    for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
      const rows = pickDistinct(CATEGORIES, 3, merged, random);
      const rowIds = new Set(rows.map((r) => r.id));
      const cols = [];
      const candidates = pickDistinct(
        CATEGORIES.filter((c) => !rowIds.has(c.id)),
        CATEGORIES.length,
        merged,
        random
      );
      for (const cand of candidates) {
        if (rows.every((r) => pairIsValid(r.id, cand.id, min))) {
          cols.push(cand);
          if (cols.length === 3) break;
        }
      }
      if (cols.length !== 3) continue;
      const rowIdList = rows.map((r) => r.id);
      const colIdList = cols.map((c) => c.id);
      if (hasDistinctSolution(rowIdList, colIdList)) {
        return { rows: rowIdList, cols: colIdList };
      }
    }
  }
  return { ...KNOWN_GOOD };
}

export function gridCells({ rows, cols }) {
  return rows.flatMap((r) =>
    cols.map((c) => ({
      row: getCategory(r),
      col: getCategory(c),
      answers: intersection(r, c),
    }))
  );
}
