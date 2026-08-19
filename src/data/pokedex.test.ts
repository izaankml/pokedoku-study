import { describe, expect, it } from "vitest";
import { POKEMON, POKEMON_BY_ID } from "./pokedex.ts";
import type { Flag, Pokemon, Region } from "./types.ts";

const SPECIES = POKEMON.filter((p) => !p.form);
const FORMS = POKEMON.filter((p) => p.form);
const NAMED = new Map(POKEMON.map((p) => [p.name, p]));
const byName = (name: string): Pokemon => {
  const pokemon = NAMED.get(name);
  if (!pokemon) throw new Error(`no such Pokémon: ${name}`);
  return pokemon;
};
const byId = (id: number): Pokemon => {
  const pokemon = POKEMON_BY_ID.get(id);
  if (!pokemon) throw new Error(`no Pokémon with id ${id}`);
  return pokemon;
};

// Guards the committed JSON against silent drift or bad regeneration.
describe("pokedex dataset invariants", () => {
  it("has all 1025 species exactly once, plus forms with unique ids", () => {
    expect(SPECIES.length).toBe(1025);
    expect(FORMS.length).toBe(298); // the forms PokeDoku lists as answers of their own
    expect(new Set(POKEMON.map((p) => p.id)).size).toBe(POKEMON.length);
    expect(new Set(POKEMON.map((p) => p.name)).size).toBe(POKEMON.length);
    for (const p of SPECIES) expect(p.species).toBe(p.id);
    for (const p of FORMS) {
      expect(p.id).toBeGreaterThanOrEqual(10000);
      expect(byId(p.species).form).toBe(null);
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
    const flagCount = (flag: Flag) => SPECIES.filter((p) => p.flags.includes(flag)).length;
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
    expect(byName("meltan").regions).toEqual([]); // GO/Let's Go, no region
    expect(byName("growlithe").regions).toEqual(["kanto"]);
    expect(byName("growlithehisui").regions).toEqual(["hisui"]);
    expect(byName("growlithehisui").types).toEqual(["fire", "rock"]);
    expect(byName("raichualola").regions).toEqual(["alola"]);
    expect(byName("meowthgalar").regions).toEqual(["galar"]);
    expect(byName("wooperpaldea").regions).toEqual(["paldea"]);
    const regional = (prefix: string, region: Region) =>
      FORMS.filter((p) => p.form?.startsWith(prefix)).every(
        (p) => p.region === region && p.regions.length === 1
      );
    expect(regional("Alola", "alola")).toBe(true);
    expect(regional("Galar", "galar")).toBe(true);
    expect(regional("Hisui", "hisui")).toBe(true);
    expect(regional("Paldea", "paldea")).toBe(true);
  });

  it("counts other forms that debuted elsewhere for both regions", () => {
    expect(byName("basculin").regions).toEqual(["unova"]);
    expect(byName("basculinwhitestriped").region).toBe("hisui");
    expect(byName("basculinwhitestriped").regions).toEqual(["unova", "hisui"]);
    expect(byName("dialgaorigin").regions).toEqual(["sinnoh", "hisui"]);
    expect(byName("ursalunabloodmoon").regions).toEqual(["hisui", "paldea"]);
    expect(byName("zygarde10").regions).toEqual(["kalos", "alola"]);
    expect(byName("hoopaunbound").regions).toEqual(["kalos", "hoenn"]);
    expect(byName("deoxysattack").regions).toEqual(["hoenn", "kanto"]);
    expect(byName("rotomwash").regions).toEqual(["sinnoh"]);
    for (const p of POKEMON) {
      if (p.region === null) expect(p.regions).toEqual([]);
      else expect(p.regions).toContain(p.region);
    }
  });

  it("makes Mega and Gigantamax forms the Mega/Gigantamax answers", () => {
    expect(byName("charizardmegax").regions).toEqual(["kanto"]);
    expect(byName("charizardmegax").types).toEqual(["fire", "dragon"]);
    expect(byName("charizardmegax").flags).toEqual(["mega"]); // not a starter
    expect(byName("charizardmegax").stage).toBe(null); // no evolution categories
    expect(byName("charizardmegay").flags).toEqual(["mega"]);
    expect(byName("charizardgmax").flags).toEqual(["gmax"]);
    expect(byName("charizardgmax").moves).toEqual([]);
    expect(byName("groudonprimal").regions).toEqual(["hoenn"]);
    expect(byName("groudonprimal").flags).not.toContain("mega"); // PokeDoku: Primal is not Mega
    expect(byName("mewtwomegax").flags).toEqual(["legendary", "mega"]);
    expect(byName("pikachustarter").flags).toEqual(["starter"]); // Let's Go partner
    // an answer because PokeDoku lists it, though its base covers every cell it could
    expect(byName("kyuremblack").answer).toBe(false); // the builder's own verdict, kept for reference
  });

  it("gives forms sensible evolution data", () => {
    expect(byName("growlithehisui").stage).toBe("first");
    expect(byName("arcaninehisui").evoMethods).toEqual(["item", "stone"]);
    expect(byName("raichualola").stage).toBe("final");
    expect(byName("meowthgalar").stage).toBe("first"); // -> Perrserker
    expect(byName("mrmimegalar").stage).toBe("middle");
    expect(byName("rotomwash").stage).toBe("single"); // inherits Rotom
    expect(byName("slowpokegalar").branched).toBe(true);
    expect(byName("articunogalar").flags).toContain("legendary");
  });

  it("gets known evolution facts right", () => {
    expect(byId(65).evoMethods).toEqual(["trade", "item"]); // Alakazam
    expect(byId(134).evoMethods).toEqual(["item", "stone"]); // Vaporeon
    expect(byId(133).evoMethods).toEqual([]); // Eevee
    expect(byId(169).evoMethods).toEqual(["friendship", "level"]); // Crobat
    expect(byId(700).evoMethods).toEqual(["friendship", "level"]); // Sylveon
    expect(byId(292).evoMethods).toEqual(["level"]); // Shedinja
    expect(byId(208).evoMethods).toEqual(["trade", "item"]); // Steelix
    expect(byId(983).evoMethods).toEqual(["level"]); // Kingambit
    expect(byId(65).stage).toBe("final");
    expect(byId(151).stage).toBe("single"); // Mew
    expect(byId(83).stage).toBe("single"); // Kantonian Farfetch'd
    expect(byId(550).stage).toBe("single"); // Red-Striped Basculin
    expect(byId(122).stage).toBe("final"); // Mr. Mime
    expect(byId(789).stage).toBe("first"); // Cosmog
    expect(byId(791).stage).toBe("final"); // Solgaleo
    expect(byId(134).evoItem).toBe("Water Stone"); // Vaporeon
    expect(byId(65).evoItem).toBe("Linking Cord"); // Alakazam
    expect(byId(208).evoItem).toBe("Metal Coat"); // Steelix (held while trading)
    expect(byId(25).evoItem).toBe(null); // Pikachu
    expect(byName("arcaninehisui").evoItem).toBe("Fire Stone");
    expect(byId(6).evoDetail).toBe("Level 36"); // Charizard
    expect(byId(197).evoDetail).toBe("High friendship at night"); // Umbreon
    expect(byId(461).evoDetail).toBe("Level up holding a Razor Claw at night"); // Weavile
    expect(byId(1).evoDetail).toBe(null); // Bulbasaur
    expect(byId(133).branched).toBe(true); // Eevee
    expect(byId(744).branched).toBe(false); // Rockruff: Lycanroc forms
    expect(byId(123).branched).toBe(true); // Scyther: Scizor / Kleavor
  });

  it("carries moves and abilities", () => {
    expect(byId(25).moves).toContain("surf"); // Pikachu
    expect(byId(6).moves).toContain("earthquake");
    expect(byId(6).moves).not.toContain("surf");
    expect(byId(130).abilities).toContain("intimidate"); // Gyarados
    expect(byId(94).abilities).toEqual([]); // Gengar lost Levitate
    expect(byName("rotomwash").moves).toContain("hydropump");
  });
});
