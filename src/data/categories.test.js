import { describe, expect, it } from "vitest";
import { CATEGORIES, getCategory } from "./categories.js";
import { POKEMON_BY_ID } from "./pokedex.js";
import { intersection, membersOf, pairIsValid } from "../logic/matching.js";

const p = (id) => POKEMON_BY_ID.get(id);
const inCat = (catId, pokemonId) => getCategory(catId).predicate(p(pokemonId));

describe("categories", () => {
  it("defines 47 categories with unique ids", () => {
    // 18 types + 2 type counts + 10 regions + 4 evo methods + 4 stages + 9 special
    expect(CATEGORIES.length).toBe(47);
    expect(new Set(CATEGORIES.map((c) => c.id)).size).toBe(47);
  });

  it("classifies known Pokémon correctly", () => {
    expect(inCat("evo-trade", 65)).toBe(true); // Alakazam
    expect(inCat("stage-final", 65)).toBe(true);
    expect(inCat("evo-item", 134)).toBe(true); // Vaporeon
    expect(inCat("evo-item", 133)).toBe(false); // Eevee did not evolve
    expect(inCat("region-hisui", 899)).toBe(true); // Wyrdeer
    expect(inCat("region-sinnoh", 899)).toBe(false);
    expect(inCat("region-galar", 899)).toBe(false);
    expect(inCat("region-hisui", 10229)).toBe(true); // Hisuian Growlithe
    expect(inCat("region-kanto", 10229)).toBe(false);
    expect(inCat("region-unova", 10247)).toBe(true); // White-Striped Basculin
    expect(inCat("region-hisui", 10247)).toBe(true);
    expect(inCat("region-kanto", 10034)).toBe(true); // Mega Charizard X
    expect(inCat("type-dragon", 10034)).toBe(true);
    expect(inCat("flag-starter", 6)).toBe(true); // Charizard
    expect(inCat("flag-mega", 6)).toBe(true);
    expect(inCat("flag-gmax", 6)).toBe(true);
    expect(inCat("flag-paradox", 1007)).toBe(true); // Koraidon
    expect(inCat("flag-legendary", 1007)).toBe(true);
    expect(inCat("dual", 479)).toBe(true); // Rotom
    expect(inCat("mono", 25)).toBe(true); // Pikachu
  });

  it("computes intersections PokeDoku-style", () => {
    const waterUnova = intersection("type-water", "region-unova");
    expect(waterUnova.map((x) => x.name)).toContain("samurott");
    const fireFighting = intersection("type-fire", "type-fighting");
    expect(fireFighting.map((x) => x.name)).toContain("blaziken");
    expect(fireFighting.map((x) => x.name)).toContain("infernape");
    // dual-region forms make a few region × region cells possible
    const unovaHisui = intersection("region-unova", "region-hisui");
    expect(unovaHisui.map((x) => x.name)).toEqual(["basculinwhitestriped"]);
    expect(pairIsValid("region-unova", "region-hisui")).toBe(true);
    expect(pairIsValid("region-kanto", "region-johto")).toBe(false);
    expect(pairIsValid("stage-first", "stage-final")).toBe(false);
  });

  it("has no empty categories", () => {
    for (const cat of CATEGORIES) {
      expect(membersOf(cat.id).length, cat.id).toBeGreaterThan(0);
    }
  });
});
