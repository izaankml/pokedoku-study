import { describe, expect, it } from "vitest";
import { generateGrid, gridCells, gridPool, MIN_CELL } from "./grid.ts";
import { getCategory } from "../data/categories.ts";
import { mergeBlocks } from "./stats.ts";

describe("generateGrid", () => {
  const merged = mergeBlocks([]);

  it("leaves moves and abilities out by default", () => {
    for (let i = 0; i < 50; i++) {
      const grid = generateGrid(merged);
      for (const id of [...grid.rows, ...grid.cols]) {
        expect(["move", "ability"]).not.toContain(getCategory(id).group);
      }
    }
  });

  it("draws only from the given pool", () => {
    const pool = gridPool(["move", "ability", "evo", "stage", "evoLine", "special", "typeCount"]);
    for (let i = 0; i < 30; i++) {
      const grid = generateGrid(merged, { pool });
      for (const id of [...grid.rows, ...grid.cols]) {
        expect(["region", "type"]).toContain(getCategory(id).group);
      }
    }
  });

  it("always produces solvable grids with distinct categories", () => {
    for (let i = 0; i < 50; i++) {
      const grid = generateGrid(merged);
      const ids = [...grid.rows, ...grid.cols];
      expect(new Set(ids).size).toBe(6);
      const cells = gridCells(grid);
      expect(cells.length).toBe(9);
      for (const cell of cells) {
        expect(
          cell.answers.length,
          `${cell.row.id} x ${cell.col.id}`
        ).toBeGreaterThanOrEqual(MIN_CELL);
      }
    }
  });
});
