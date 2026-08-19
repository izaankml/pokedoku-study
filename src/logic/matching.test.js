import { describe, expect, it } from "vitest";
import { findByName, guessFilterFor, normalizeName, pairIsValid, searchNames } from "./matching.js";

describe("normalizeName", () => {
  it("strips diacritics and punctuation", () => {
    expect(normalizeName("Flabébé")).toBe("flabebe");
    expect(normalizeName("Mr. Mime")).toBe("mrmime");
    expect(normalizeName("Farfetch’d")).toBe("farfetchd");
    expect(normalizeName("farfetch'd")).toBe("farfetchd");
    expect(normalizeName("Type: Null")).toBe("typenull");
    expect(normalizeName("Ho-Oh")).toBe("hooh");
    expect(normalizeName("Nidoran♀")).toBe("nidoranf");
    expect(normalizeName("Nidoran♂")).toBe("nidoranm");
  });
});

describe("findByName", () => {
  it("resolves user spellings to species", () => {
    expect(findByName("mr mime").id).toBe(122);
    expect(findByName("NIDORAN♀").id).toBe(29);
    expect(findByName("flabebe").id).toBe(669);
    expect(findByName("notapokemon")).toBe(null);
  });

  it("resolves forms by display name or dex slug", () => {
    expect(findByName("Hisuian Growlithe").name).toBe("growlithehisui");
    expect(findByName("growlithe hisui").name).toBe("growlithehisui");
    expect(findByName("growlithe").id).toBe(58);
    expect(findByName("Mega Charizard X").name).toBe("charizardmegax");
    expect(findByName("charizard mega x").name).toBe("charizardmegax");
    expect(findByName("basculin white-striped").name).toBe("basculinwhitestriped");
  });
});

describe("searchNames", () => {
  it("prefers prefix matches", () => {
    const results = searchNames("pika");
    expect(results[0].name).toBe("pikachu");
  });

  it("falls back to substring matches", () => {
    expect(searchNames("chu").map((p) => p.name)).toContain("raichu");
  });

  it("finds forms by their species, never by the form word alone", () => {
    expect(searchNames("venusaur").map((p) => p.displayName)).toEqual(["Venusaur", "Venusaur Mega", "Venusaur Gmax"]);
    expect(searchNames("venusaur m")[0].displayName).toBe("Venusaur Mega");
    expect(searchNames("galarian z").map((p) => p.displayName)).toContain("Zapdos Galar");
    expect(searchNames("dusk").map((p) => p.displayName)).toEqual(["Duskull", "Dusknoir"]);
    for (const formWord of ["gmax", "gigantamax", "hisui", "hisuian", "galar", "galarian", "paldea"]) {
      expect(searchNames(formWord, 50)).toEqual([]);
    }
    // ("alola" is a near-miss of Gallade, a species; no Alolan form is offered)
    expect(searchNames("alola", 50).map((p) => p.displayName)).toEqual(["Gallade", "Gallade Mega"]);
    // only species whose own name carries it
    expect(searchNames("mega", 50).map((p) => p.displayName)).toEqual(["Meganium", "Meganium Mega", "Yanmega"]);
  });

  it("forgives typos, more of them the longer the query, with exact hits ranked first", () => {
    expect(searchNames("charzard")[0].displayName).toBe("Charizard");
    expect(searchNames("dusknior").map((p) => p.displayName)).toEqual(["Dusknoir"]);
    expect(searchNames("pikachoo")[0].displayName).toBe("Pikachu");
    expect(searchNames("typhlosoin").map((p) => p.displayName)).toEqual(["Typhlosion", "Typhlosion Hisui"]);
    expect(searchNames("lycanrock dusk").map((p) => p.displayName)).toEqual(["Lycanroc Dusk"]);
    expect(searchNames("sneasle").map((p) => p.displayName)).toEqual(["Sneasler", "Sneasel", "Sneasel Hisui"]);
    // too short to forgive anything
    expect(searchNames("pikc")).toEqual([]);
    // a typo budget never lands on a form word, so forms still need their species
    expect(searchNames("meganuim").map((p) => p.displayName)).toEqual(["Meganium", "Meganium Mega"]);
    for (const formWord of ["galarian", "hisuian", "alolan", "gigantamax"]) expect(searchNames(formWord, 50)).toEqual([]);
  });
});

describe("pairIsValid", () => {
  it("rejects structurally empty same-group pairs", () => {
    expect(pairIsValid("region-kanto", "region-unova")).toBe(false);
    expect(pairIsValid("stage-first", "stage-final")).toBe(false);
    expect(pairIsValid("mono", "dual")).toBe(false);
    expect(pairIsValid("type-fire", "type-fire")).toBe(false);
  });

  it("allows dual-type pairs and cross-group pairs", () => {
    expect(pairIsValid("type-fire", "type-fighting")).toBe(true);
    expect(pairIsValid("type-water", "region-unova")).toBe(true);
    expect(pairIsValid("flag-legendary", "flag-mega")).toBe(true); // Mewtwo etc.
  });

  it("rejects empty cross-group intersections", () => {
    // Ultra Beasts are their own thing, never legendary in our data
    expect(pairIsValid("flag-ultraBeast", "flag-legendary")).toBe(false);
    // no baby is a fossil
    expect(pairIsValid("flag-baby", "flag-fossil")).toBe(false);
  });
});

describe("guessFilterFor", () => {
  it("drops Mega and Gigantamax forms when a category considers the evolution line", () => {
    for (const ids of [["type-fire", "stage-final"], ["evo-level", "type-water"], ["branched", "region-kanto"], ["flag-starter", "type-grass"], ["flag-baby", "type-normal"]]) {
      const eligible = guessFilterFor(ids);
      expect(eligible).toBeTypeOf("function");
      expect(searchNames("charizard", 8, eligible).map((p) => p.displayName)).toEqual(["Charizard"]);
      expect(findByName("Charizard Mega X", eligible)).toBeNull();
      expect(findByName("Charizard", eligible)?.displayName).toBe("Charizard");
    }
  });
  it("offers everyone otherwise", () => {
    expect(guessFilterFor(["type-fire", "flag-mega"])).toBeNull();
    expect(searchNames("charizard mega x", 8, null).map((p) => p.displayName)).toContain("Charizard Mega X");
  });
});
