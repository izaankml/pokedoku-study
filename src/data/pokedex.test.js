import { describe, expect, it } from "vitest";
import { POKEMON, POKEMON_BY_ID } from "./pokedex.js";

const SPECIES = POKEMON.filter((p) => !p.form);
const FORMS = POKEMON.filter((p) => p.form);
const byName = new Map(POKEMON.map((p) => [p.name, p]));

// Guards the committed JSON against silent drift or bad regeneration.
describe("pokedex dataset invariants", () => {
  it("has all 1025 species exactly once, plus forms with unique ids", () => {
    expect(SPECIES.length).toBe(1025);
    expect(FORMS.length).toBe(113);
    expect(new Set(POKEMON.map((p) => p.id)).size).toBe(POKEMON.length);
    expect(new Set(POKEMON.map((p) => p.name)).size).toBe(POKEMON.length);
    for (const p of SPECIES) expect(p.species).toBe(p.id);
    for (const p of FORMS) {
      expect(p.id).toBeGreaterThanOrEqual(10000);
      expect(POKEMON_BY_ID.get(p.species).form).toBe(null);
    }
  });

  it("has the known per-generation counts", () => {
    const expected = [151, 100, 135, 107, 156, 72, 88, 96, 120];
    for (let gen = 1; gen <= 9; gen++) {
      expect(SPECIES.filter((p) => p.gen === gen).length).toBe(expected[gen - 1]);
    }
  });

  it("uses exactly 18 types", () => {
    expect(new Set(POKEMON.flatMap((p) => p.types)).size).toBe(18);
  });

  it("has the known special-group sizes", () => {
    const flagCount = (f) => SPECIES.filter((p) => p.flags.includes(f)).length;
    expect(flagCount("ultraBeast")).toBe(11);
    expect(flagCount("paradox")).toBe(22);
    expect(flagCount("fossil")).toBe(25);
    expect(flagCount("starter")).toBe(81);
    expect(flagCount("baby")).toBe(19);
    expect(flagCount("gmax")).toBe(32);
    expect(flagCount("mega")).toBe(87);
    expect(flagCount("legendary")).toBe(71);
    expect(flagCount("mythical")).toBe(23);
  });

  it("assigns Hisui to exactly the Legends: Arceus species", () => {
    const hisui = SPECIES.filter((p) => p.region === "hisui").map((p) => p.id);
    expect(hisui).toEqual([899, 900, 901, 902, 903, 904, 905]);
  });

  it("puts regional forms only in the region they debuted in", () => {
    for (const p of SPECIES) expect(p.regions).toEqual([p.region]);
    expect(byName.get("growlithe").regions).toEqual(["kanto"]);
    expect(byName.get("growlithehisui").regions).toEqual(["hisui"]);
    expect(byName.get("growlithehisui").types).toEqual(["fire", "rock"]);
    expect(byName.get("raichualola").regions).toEqual(["alola"]);
    expect(byName.get("meowthgalar").regions).toEqual(["galar"]);
    expect(byName.get("wooperpaldea").regions).toEqual(["paldea"]);
    const regional = (prefix, region) =>
      FORMS.filter((p) => p.form.startsWith(prefix)).every(
        (p) => p.region === region && p.regions.length === 1
      );
    expect(regional("Alola", "alola")).toBe(true);
    expect(regional("Galar", "galar")).toBe(true);
    expect(regional("Hisui", "hisui")).toBe(true);
    expect(regional("Paldea", "paldea")).toBe(true);
  });

  it("counts other forms that debuted elsewhere for both regions", () => {
    expect(byName.get("basculin").regions).toEqual(["unova"]);
    expect(byName.get("basculinwhitestriped").region).toBe("hisui");
    expect(byName.get("basculinwhitestriped").regions).toEqual(["unova", "hisui"]);
    expect(byName.get("dialgaorigin").regions).toEqual(["sinnoh", "hisui"]);
    expect(byName.get("ursalunabloodmoon").regions).toEqual(["hisui", "paldea"]);
    expect(byName.get("zygarde10").regions).toEqual(["kalos", "alola"]);
    expect(byName.get("rotomwash").regions).toEqual(["sinnoh"]);
    for (const p of POKEMON) expect(p.regions).toContain(p.region);
  });

  it("keeps Mega and Primal forms in their base species' region", () => {
    expect(byName.get("charizardmegax").regions).toEqual(["kanto"]);
    expect(byName.get("charizardmegax").types).toEqual(["fire", "dragon"]);
    expect(byName.get("charizardmegax").flags).toContain("mega");
    expect(byName.get("groudonprimal").regions).toEqual(["hoenn"]);
    expect(byName.get("groudonprimal").flags).not.toContain("mega"); // PokeDoku: Primal is not Mega
    // covered entirely by its base species, so no record
    expect(byName.has("charizardmegay")).toBe(false);
  });

  it("gives forms sensible evolution data", () => {
    expect(byName.get("growlithehisui").stage).toBe("first");
    expect(byName.get("arcaninehisui").evoMethod).toBe("item");
    expect(byName.get("raichualola").stage).toBe("final");
    expect(byName.get("meowthgalar").stage).toBe("first"); // -> Perrserker
    expect(byName.get("mrmimegalar").stage).toBe("middle");
    expect(byName.get("rotomwash").stage).toBe("single"); // inherits Rotom
    expect(byName.get("charizardmegax").stage).toBe("final"); // inherits Charizard
    expect(byName.get("articunogalar").flags).toContain("legendary");
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
