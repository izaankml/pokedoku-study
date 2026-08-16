import { describe, expect, it } from "vitest";
import { POKEMON, POKEMON_BY_ID } from "./pokedex.js";

// Guards the committed JSON against silent drift or bad regeneration.
describe("pokedex dataset invariants", () => {
  it("has all 1025 species exactly once", () => {
    expect(POKEMON.length).toBe(1025);
    expect(new Set(POKEMON.map((p) => p.id)).size).toBe(1025);
  });

  it("has the known per-generation counts", () => {
    const expected = [151, 100, 135, 107, 156, 72, 88, 96, 120];
    for (let gen = 1; gen <= 9; gen++) {
      expect(POKEMON.filter((p) => p.gen === gen).length).toBe(expected[gen - 1]);
    }
  });

  it("uses exactly 18 types", () => {
    expect(new Set(POKEMON.flatMap((p) => p.types)).size).toBe(18);
  });

  it("has the known special-group sizes", () => {
    const flagCount = (f) => POKEMON.filter((p) => p.flags.includes(f)).length;
    expect(flagCount("ultraBeast")).toBe(11);
    expect(flagCount("paradox")).toBe(22);
    expect(flagCount("fossil")).toBe(25);
    expect(flagCount("starter")).toBe(81);
    expect(flagCount("baby")).toBe(19);
    expect(flagCount("gmax")).toBe(32);
    expect(flagCount("mega")).toBe(85);
    expect(flagCount("legendary")).toBe(71);
    expect(flagCount("mythical")).toBe(23);
  });

  it("assigns Hisui to exactly the Legends: Arceus species", () => {
    const hisui = POKEMON.filter((p) => p.region === "hisui").map((p) => p.id);
    expect(hisui).toEqual([899, 900, 901, 902, 903, 904, 905]);
  });

  it("gets known evolution facts right", () => {
    expect(POKEMON_BY_ID.get(65).evoMethod).toBe("trade"); // Alakazam
    expect(POKEMON_BY_ID.get(134).evoMethod).toBe("item"); // Vaporeon
    expect(POKEMON_BY_ID.get(133).evoMethod).toBe(null); // Eevee
    expect(POKEMON_BY_ID.get(169).evoMethod).toBe("friendship"); // Crobat
    expect(POKEMON_BY_ID.get(700).evoMethod).toBe("friendship"); // Sylveon
    expect(POKEMON_BY_ID.get(292).evoMethod).toBe("other"); // Shedinja
    expect(POKEMON_BY_ID.get(65).stage).toBe("final");
    expect(POKEMON_BY_ID.get(151).stage).toBe("single"); // Mew
    expect(POKEMON_BY_ID.get(789).stage).toBe("first"); // Cosmog
    expect(POKEMON_BY_ID.get(791).stage).toBe("final"); // Solgaleo
  });
});
