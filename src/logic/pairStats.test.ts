import { describe, expect, it } from "vitest";
import type { PickStatsCell, PickStatsPuzzle } from "../data/types.ts";
import { buildPairStats } from "./pairStats.ts";

const category = (type: string, obj: string | boolean = true) => ({ type, obj, excludedPokemonIds: [] });

// rows: Ghost, Grass, Ground; columns: First Partner, Hoenn, Dark (the
// 1 Sep 2026 board)
const SPEC = {
  y1: category("POKEMON_TYPE", "ghost"),
  y2: category("POKEMON_TYPE", "grass"),
  y3: category("POKEMON_TYPE", "ground"),
  x1: category("FIRST_PARTNER"),
  x2: category("GENERATION", "generation-iii"),
  x3: category("POKEMON_TYPE", "dark"),
};

const quiet: PickStatsCell = { total: 0, picks: [] };

// nine quiet cells with the given ones filled in
const cells = (filled: Record<number, PickStatsCell>): PickStatsCell[] =>
  Array.from({ length: 9 }, (_, index) => filled[index] ?? quiet);

describe("buildPairStats", () => {
  it("keys each cell by its app category pair and sums picks over the boards that ran it", () => {
    const first: PickStatsPuzzle = {
      id: 1,
      date: "2026-09-01",
      spec: SPEC,
      cells: cells({ 0: { total: 100, picks: [[724, 60], [911, 40]] } }),
    };
    // the same pair on another board, in another cell: First Partner is
    // now the first row and Ghost the last column, so it's cell 2
    const second: PickStatsPuzzle = {
      id: 2,
      date: "2026-09-05",
      spec: {
        ...SPEC,
        y1: category("FIRST_PARTNER"),
        x1: category("POKEMON_TYPE", "fire"),
        x3: category("POKEMON_TYPE", "ghost"),
      },
      cells: cells({ 2: { total: 50, picks: [[911, 30], [10233, 20]] } }),
    };
    const table = buildPairStats([first, second], 10);
    expect(Object.keys(table)).toEqual(["flag-starter|type-ghost"]);
    expect(table["flag-starter|type-ghost"]).toEqual({
      boards: 2,
      total: 150,
      picks: [
        [911, 70],
        [724, 60],
        [10233, 20],
      ],
    });
  });

  it("skips boards without a spec, cells under the pick floor, and axes the app lacks", () => {
    const backfilled: PickStatsPuzzle = { id: 3, cells: cells({ 0: { total: 100, picks: [[724, 100]] } }) };
    const withTrio: PickStatsPuzzle = {
      id: 4,
      date: "2026-09-06",
      spec: { ...SPEC, x1: category("LEGENDARY_TRIO", "birds") },
      cells: cells({
        0: { total: 100, picks: [[144, 100]] }, // Ghost × trio: unmappable
        1: { total: 5, picks: [[353, 5]] }, // Ghost × Hoenn: under the floor
        2: { total: 100, picks: [[302, 100]] }, // Ghost × Dark: counts
      }),
    };
    const table = buildPairStats([backfilled, withTrio], 10);
    expect(Object.keys(table)).toEqual(["type-dark|type-ghost"]);
    expect(table["type-dark|type-ghost"].boards).toBe(1);
  });

  it("orders keys and ties in picks deterministically", () => {
    const puzzle: PickStatsPuzzle = {
      id: 5,
      date: "2026-09-07",
      spec: SPEC,
      cells: cells({
        8: { total: 40, picks: [[553, 20], [552, 20]] },
        0: { total: 40, picks: [[724, 40]] },
      }),
    };
    const table = buildPairStats([puzzle], 10);
    expect(Object.keys(table)).toEqual(["flag-starter|type-ghost", "type-dark|type-ground"]);
    expect(table["type-dark|type-ground"].picks).toEqual([
      [552, 20],
      [553, 20],
    ]);
  });
});
