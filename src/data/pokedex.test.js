import { describe, expect, it } from "vitest";
import { POKEMON, POKEMON_BY_ID } from "./pokedex.js";

const SPECIES = POKEMON.filter((p) => !p.form);
const FORMS = POKEMON.filter((p) => p.form);
const byName = new Map(POKEMON.map((p) => [p.name, p]));

// Guards the committed JSON against silent drift or bad regeneration.
describe("pokedex dataset invariants", () => {
  it("has all 1025 species exactly once, plus forms with unique ids", () => {
    expect(SPECIES.length).toBe(1025);
    expect(FORMS.length).toBe(296); // (Meowstic Female Mega is hidden on PokeDoku) // the forms PokeDoku lists as answers of their own
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
    expect(flagCount("gmax")).toBe(0); // Gigantamax forms carry it instead
    expect(flagCount("mega")).toBe(0);
    expect(FORMS.filter((p) => p.flags.includes("gmax")).length).toBe(34);
    expect(FORMS.filter((p) => p.flags.includes("mega")).length).toBe(96);
    expect(flagCount("legendary")).toBe(71);
    expect(flagCount("mythical")).toBe(23);
  });

  it("assigns Hisui to exactly the Legends: Arceus species", () => {
    const hisui = SPECIES.filter((p) => p.region === "hisui").map((p) => p.id);
    expect(hisui).toEqual([899, 900, 901, 902, 903, 904, 905]);
  });

  it("puts regional forms only in the region they debuted in", () => {
    for (const p of SPECIES) expect(p.regions).toEqual(p.region ? [p.region] : []);
    expect(byName.get("meltan").regions).toEqual([]); // GO/Let's Go, no region
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
    expect(byName.get("hoopaunbound").regions).toEqual(["kalos", "hoenn"]);
    expect(byName.get("deoxysattack").regions).toEqual(["hoenn", "kanto"]);
    expect(byName.get("rotomwash").regions).toEqual(["sinnoh"]);
    for (const p of POKEMON) {
      if (p.region === null) expect(p.regions).toEqual([]);
      else expect(p.regions).toContain(p.region);
    }
  });

  it("makes Mega and Gigantamax forms the Mega/Gigantamax answers", () => {
    expect(byName.get("charizardmegax").regions).toEqual(["kanto"]);
    expect(byName.get("charizardmegax").types).toEqual(["fire", "dragon"]);
    expect(byName.get("charizardmegax").flags).toEqual(["mega"]); // not a starter
    expect(byName.get("charizardmegax").stage).toBe(null); // no evolution categories
    expect(byName.get("charizardmegay").flags).toEqual(["mega"]);
    expect(byName.get("charizardgmax").flags).toEqual(["gmax"]);
    expect(byName.get("charizardgmax").moves).toEqual([]);
    expect(byName.get("groudonprimal").regions).toEqual(["hoenn"]);
    expect(byName.get("groudonprimal").flags).not.toContain("mega"); // PokeDoku: Primal is not Mega
    expect(byName.get("mewtwomegax").flags).toEqual(["legendary", "mega"]);
    expect(byName.get("pikachustarter").flags).toEqual(["starter"]); // Let's Go partner
    // an answer because PokeDoku lists it, though its base covers every cell it could
    expect(byName.get("kyuremblack").answer).toBe(false); // the builder's own verdict, kept for reference
  });

  it("gives forms sensible evolution data", () => {
    expect(byName.get("growlithehisui").stage).toBe("first");
    expect(byName.get("arcaninehisui").evoMethods).toEqual(["item", "stone"]);
    expect(byName.get("raichualola").stage).toBe("final");
    expect(byName.get("meowthgalar").stage).toBe("first"); // -> Perrserker
    expect(byName.get("mrmimegalar").stage).toBe("middle");
    expect(byName.get("rotomwash").stage).toBe("single"); // inherits Rotom
    expect(byName.get("slowpokegalar").branched).toBe(true);
    expect(byName.get("articunogalar").flags).toContain("legendary");
  });

  it("gets known evolution facts right", () => {
    expect(POKEMON_BY_ID.get(65).evoMethods).toEqual(["trade", "item"]); // Alakazam
    expect(POKEMON_BY_ID.get(134).evoMethods).toEqual(["item", "stone"]); // Vaporeon
    expect(POKEMON_BY_ID.get(133).evoMethods).toEqual([]); // Eevee
    expect(POKEMON_BY_ID.get(169).evoMethods).toEqual(["friendship", "level"]); // Crobat
    expect(POKEMON_BY_ID.get(700).evoMethods).toEqual(["friendship", "level"]); // Sylveon
    expect(POKEMON_BY_ID.get(292).evoMethods).toEqual(["level"]); // Shedinja
    expect(POKEMON_BY_ID.get(208).evoMethods).toEqual(["trade", "item"]); // Steelix
    expect(POKEMON_BY_ID.get(983).evoMethods).toEqual(["level"]); // Kingambit
    expect(POKEMON_BY_ID.get(65).stage).toBe("final");
    expect(POKEMON_BY_ID.get(151).stage).toBe("single"); // Mew
    expect(POKEMON_BY_ID.get(83).stage).toBe("single"); // Kantonian Farfetch'd
    expect(POKEMON_BY_ID.get(550).stage).toBe("single"); // Red-Striped Basculin
    expect(POKEMON_BY_ID.get(122).stage).toBe("final"); // Mr. Mime
    expect(POKEMON_BY_ID.get(789).stage).toBe("first"); // Cosmog
    expect(POKEMON_BY_ID.get(791).stage).toBe("final"); // Solgaleo
    expect(POKEMON_BY_ID.get(134).evoItem).toBe("Water Stone"); // Vaporeon
    expect(POKEMON_BY_ID.get(65).evoItem).toBe("Linking Cord"); // Alakazam
    expect(POKEMON_BY_ID.get(208).evoItem).toBe("Metal Coat"); // Steelix (held while trading)
    expect(POKEMON_BY_ID.get(25).evoItem).toBe(null); // Pikachu
    expect(byName.get("arcaninehisui").evoItem).toBe("Fire Stone");
    expect(POKEMON_BY_ID.get(6).evoDetail).toBe("Level 36"); // Charizard
    expect(POKEMON_BY_ID.get(197).evoDetail).toBe("High friendship at night"); // Umbreon
    expect(POKEMON_BY_ID.get(461).evoDetail).toBe("Level up holding a Razor Claw at night"); // Weavile
    expect(POKEMON_BY_ID.get(1).evoDetail).toBe(null); // Bulbasaur
    expect(POKEMON_BY_ID.get(133).branched).toBe(true); // Eevee
    expect(POKEMON_BY_ID.get(744).branched).toBe(false); // Rockruff: Lycanroc forms
    expect(POKEMON_BY_ID.get(123).branched).toBe(true); // Scyther: Scizor / Kleavor
  });

  it("carries moves and abilities", () => {
    expect(POKEMON_BY_ID.get(25).moves).toContain("surf"); // Pikachu
    expect(POKEMON_BY_ID.get(6).moves).toContain("earthquake");
    expect(POKEMON_BY_ID.get(6).moves).not.toContain("surf");
    expect(POKEMON_BY_ID.get(130).abilities).toContain("intimidate"); // Gyarados
    expect(POKEMON_BY_ID.get(94).abilities).toEqual([]); // Gengar lost Levitate
    expect(byName.get("rotomwash").moves).toContain("hydropump");
  });
});
