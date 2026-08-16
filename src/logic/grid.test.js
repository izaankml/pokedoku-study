import { describe, expect, it } from "vitest";
import { generateGrid, gridCells, MIN_CELL } from "./grid.js";
import { mergeBlocks } from "./stats.js";

describe("generateGrid", () => {
  const merged = mergeBlocks([]);

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
