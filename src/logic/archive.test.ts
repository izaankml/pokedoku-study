import { describe, expect, it } from "vitest";
import { POKEMON_BY_ID } from "../data/pokedex.ts";
import type { PickStatsPuzzle } from "../data/types.ts";
import { intersection } from "./matching.ts";
import { archivedAnswers, archivedShare, boardFromArchive, categoryIdFor, formatArchiveDate } from "./archive.ts";

// PokeDoku #1663 (2026-09-01) as archived, cells trimmed to what the tests need
const EXCLUDED_FORMS = ["mega", "mega-x", "mega-y", "mega-z", "mega-male", "mega-female", "gmax", "ash", "eternamax"];
const puzzle1663: PickStatsPuzzle = {
  id: 1663,
  date: "2026-09-01",
  spec: {
    type: "AUTOMATIC",
    x1: { type: "FIRST_PARTNER", obj: true, excludedPokemonIds: [133, 25], excludedForms: EXCLUDED_FORMS },
    x2: { type: "GENERATION", obj: "generation-iii", excludedPokemonIds: [], excludedForms: [] },
    x3: { type: "POKEMON_TYPE", obj: "dark", excludedPokemonIds: [], excludedForms: [] },
    y1: { type: "POKEMON_TYPE", obj: "ghost", excludedPokemonIds: [], excludedForms: [] },
    y2: { type: "POKEMON_TYPE", obj: "grass", excludedPokemonIds: [], excludedForms: [] },
    y3: { type: "POKEMON_TYPE", obj: "ground", excludedPokemonIds: [], excludedForms: [] },
  },
  cells: [
    // ghost × first partner: Decidueye, Skeledirge, Hisuian Typhlosion
    { total: 29450, picks: [[724, 11559], [911, 9300], [10233, 8591]] },
    ...Array.from({ length: 8 }, () => ({ total: 100, picks: [[1, 100]] as [number, number][] })),
  ],
};

describe("categoryIdFor", () => {
  it("maps every kind of PokeDoku category onto an app category", () => {
    expect(categoryIdFor({ type: "POKEMON_TYPE", obj: "ghost" })).toBe("type-ghost");
    expect(categoryIdFor({ type: "GENERATION", obj: "generation-viii" })).toBe("region-galar");
    expect(categoryIdFor({ type: "HISUI", obj: true })).toBe("region-hisui");
    expect(categoryIdFor({ type: "EVOLVED_BY", obj: "level-up" })).toBe("evo-level");
    expect(categoryIdFor({ type: "EVOLVED_BY", obj: "trade" })).toBe("evo-trade");
    expect(categoryIdFor({ type: "EVOLUTION_POSITION", obj: "premature" })).toBe("stage-notFully");
    expect(categoryIdFor({ type: "EVOLUTION_POSITION", obj: "none" })).toBe("stage-single");
    expect(categoryIdFor({ type: "FIRST_PARTNER", obj: true })).toBe("flag-starter");
    expect(categoryIdFor({ type: "POKEMON_MOVE", obj: "Brick Break" })).toBe("move-brickbreak");
    expect(categoryIdFor({ type: "POKEMON_ABILITY", obj: "Swift Swim" })).toBe("ability-swiftswim");
  });

  it("is null for kinds and values the app lacks", () => {
    expect(categoryIdFor({ type: "LEGENDARY_TRIO", obj: true })).toBeNull();
    expect(categoryIdFor({ type: "POKEMON_MOVE", obj: "Splash" })).toBeNull();
    expect(categoryIdFor({ type: "GENERATION", obj: "generation-x" })).toBeNull();
  });
});

describe("boardFromArchive", () => {
  it("lays PokeDoku's y categories out as rows and x as columns, with its exclusions per cell", () => {
    const load = boardFromArchive(puzzle1663);
    if (!("board" in load)) throw new Error(load.unplayable);
    expect(load.board.grid).toEqual({
      rows: ["type-ghost", "type-grass", "type-ground"],
      cols: ["flag-starter", "region-hoenn", "type-dark"],
    });
    // cell 1 is ghost × first partner: Pikachu and Eevee are out there…
    expect([...load.board.excluded[0]].sort((a, b) => a - b)).toEqual([25, 133]);
    // …and in the other first-partner cells, but nowhere else
    expect(load.board.excluded[3].size).toBe(2);
    expect(load.board.excluded[1].size).toBe(0);
    expect(load.board.date).toBe("2026-09-01");
  });

  it("refuses a board archived without its categories, or with a kind the app lacks", () => {
    const backfilled = boardFromArchive({ id: 1568, cells: puzzle1663.cells });
    expect("unplayable" in backfilled && backfilled.unplayable).toMatch(/without its categories/);
    const trio = boardFromArchive({
      ...puzzle1663,
      spec: { ...puzzle1663.spec, x2: { type: "LEGENDARY_TRIO", obj: true } },
    });
    expect("unplayable" in trio && trio.unplayable).toMatch(/LEGENDARY_TRIO/);
  });
});

describe("archivedShare and archivedAnswers", () => {
  const load = boardFromArchive(puzzle1663);
  const board = "board" in load ? load.board : null;

  it("is each pick's share of the cell, resolving PokeDoku's form ids", () => {
    const decidueye = POKEMON_BY_ID.get(724);
    if (!board || !decidueye) throw new Error("fixture");
    expect(archivedShare(board.cells[0], decidueye)).toBeCloseTo((100 * 11559) / 29450, 5);
    // Zygarde 50% is PokeDoku's 10119, the app's 718
    const zygarde = POKEMON_BY_ID.get(718);
    if (!zygarde) throw new Error("fixture");
    expect(archivedShare({ total: 200, picks: [[10119, 50], [1, 150]] }, zygarde)).toBe(25);
    expect(archivedShare(board.cells[0], zygarde)).toBe(0);
  });

  it("accepts the app's answers less exclusions plus PokeDoku's own picks, most picked first", () => {
    if (!board) throw new Error("fixture");
    const answers = archivedAnswers(board, 0, intersection("type-ghost", "flag-starter"));
    expect(answers.slice(0, 3).map((pokemon) => pokemon.id)).toEqual([724, 911, 10233]);
    expect(answers.some((pokemon) => pokemon.species === 25 || pokemon.species === 133)).toBe(false);
    // a Pokémon PokeDoku accepted but the app's data doesn't is still an answer
    const withStray = { ...board, cells: board.cells.map((cell, index) => (index === 0 ? { total: cell.total + 1, picks: [...cell.picks, [1, 1] as [number, number]] } : cell)) };
    expect(archivedAnswers(withStray, 0, intersection("type-ghost", "flag-starter")).some((pokemon) => pokemon.id === 1)).toBe(true);
  });
});

describe("formatArchiveDate", () => {
  it("names the calendar day without a timezone shift", () => {
    expect(formatArchiveDate("2026-09-01")).toMatch(/1/);
    expect(formatArchiveDate("2026-09-01")).toMatch(/Sep/);
    expect(formatArchiveDate("2026-09-01")).toMatch(/2026/);
    expect(formatArchiveDate("2026-09-01", "short")).toMatch(/^1 Sep$|^Sep 1$/);
  });
});
