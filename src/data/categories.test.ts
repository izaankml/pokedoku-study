import { describe, expect, it } from "vitest";
import { CATEGORIES, QUIZ_CATEGORIES, getCategory, whyNot } from "./categories.ts";
import { POKEMON_BY_ID } from "./pokedex.ts";
import type { Pokemon } from "./types.ts";
import { intersection, membersOf, pairIsValid } from "../logic/matching.ts";

const p = (id: number): Pokemon => {
  const pokemon = POKEMON_BY_ID.get(id);
  if (!pokemon) throw new Error(`no Pokémon with id ${id}`);
  return pokemon;
};
const inCat = (catId: string, pokemonId: number): boolean => getCategory(catId).predicate(p(pokemonId));

describe("categories", () => {
  it("defines 81 categories with unique ids", () => {
    // 18 types + 2 type counts + 10 regions + 5 evo methods + 5 stages
    // + branched + 9 special + 22 moves + 5 abilities + 4 fun
    expect(CATEGORIES.length).toBe(81);
    expect(new Set(CATEGORIES.map((category) => category.id)).size).toBe(81);
    // the fun filters are Browse-only: never quizzed
    expect(QUIZ_CATEGORIES.length).toBe(77);
    expect(QUIZ_CATEGORIES.some((category) => category.group === "fun")).toBe(false);
  });

  it("classifies the fun Browse-only filters", () => {
    expect(inCat("fun-pikachuClone", 25)).toBe(true); // Pikachu
    expect(inCat("fun-pikachuClone", 702)).toBe(true); // Dedenne
    expect(inCat("fun-pikachuClone", 1)).toBe(false);
    // the hand-list's every id is a real species (a typo would silently
    // shrink the category), and the archetype spans 12 species
    const clones = membersOf("fun-pikachuClone");
    expect(new Set(clones.map((pokemon) => pokemon.species)).size).toBe(12);
    expect(inCat("fun-evoTypeChange", 130)).toBe(true); // Magikarp → Gyarados
    expect(inCat("fun-evoTypeChange", 2)).toBe(false); // Ivysaur keeps Grass/Poison
    expect(inCat("fun-formTypeChange", 10034)).toBe(true); // Mega Charizard X
    expect(inCat("fun-formTypeChange", 10196)).toBe(false); // Gmax keeps its typing
    expect(inCat("fun-uniqueTyping", 292)).toBe(true); // Shedinja: the only Bug/Ghost
    expect(inCat("fun-uniqueTyping", 25)).toBe(false); // Pikachu: pure Electric is common
    expect(inCat("fun-uniqueTyping", 6)).toBe(false); // Charizard shares Fire/Flying with Ho-Oh
  });

  it("classifies known Pokémon correctly", () => {
    expect(inCat("evo-trade", 65)).toBe(true); // Alakazam
    expect(inCat("evo-item", 65)).toBe(true); // ...and by Linking Cord
    expect(inCat("stage-final", 65)).toBe(true);
    expect(inCat("evo-item", 134)).toBe(true); // Vaporeon
    expect(inCat("evo-stone", 134)).toBe(true);
    expect(inCat("evo-item", 133)).toBe(false); // Eevee did not evolve
    expect(inCat("branched", 133)).toBe(true);
    expect(inCat("stage-notFully", 133)).toBe(true);
    expect(inCat("stage-single", 83)).toBe(true); // Kantonian Farfetch'd
    expect(inCat("move-surf", 25)).toBe(true); // Pikachu
    expect(inCat("ability-intimidate", 130)).toBe(true); // Gyarados
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
    expect(inCat("flag-mega", 6)).toBe(false); // the Mega forms are the answers
    expect(inCat("flag-mega", 10034)).toBe(true); // Mega Charizard X
    expect(inCat("flag-gmax", 6)).toBe(false);
    expect(inCat("flag-gmax", 10196)).toBe(true); // Gigantamax Charizard
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
    expect(pairIsValid("stage-first", "stage-notFully")).toBe(false); // exclusive group
    expect(pairIsValid("evo-trade", "evo-item")).toBe(true); // Alakazam & co.
    expect(pairIsValid("move-earthquake", "type-dragon")).toBe(true);
    expect(pairIsValid("flag-mega", "type-dragon")).toBe(true); // Mega Charizard X
  });

  it("has no empty categories", () => {
    for (const cat of CATEGORIES) {
      expect(membersOf(cat.id).length, cat.id).toBeGreaterThan(0);
    }
  });
});

describe("whyNot", () => {
  it("names each failed category as a clause", () => {
    const pikachu = p(25);
    expect(whyNot(pikachu, ["type-fire", "region-kanto"])).toBe("isn't Fire-type");
    expect(whyNot(pikachu, ["type-fire", "region-galar"])).toBe("isn't Fire-type and isn't from Galar");
    expect(whyNot(pikachu, ["type-electric", "region-kanto"])).toBe("");
    expect(whyNot(pikachu, ["move-razorleaf", "flag-legendary"])).toBe("can't learn Razor Leaf and isn't Legendary");
  });
});
