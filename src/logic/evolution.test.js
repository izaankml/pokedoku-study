import { describe, expect, it } from "vitest";
import { ALL_POKEMON as POKEMON } from "../data/pokedex.js";
import { evoNote, evoWhere, evolutionLine, evolutionTree, shortHow, titleCase } from "./evolution.js";

const byName = (n) => POKEMON.find((p) => p.displayName === n || p.altName === n);

describe("evoWhere", () => {
  it("names the region for a regional form that evolves from another form", () => {
    expect(evoWhere(byName("Weezing Galar"))).toBe("in Galar");
    expect(evoWhere(byName("Raichu Alola"))).toBe("in Alola");
    expect(evoWhere(byName("Typhlosion Hisui"))).toBe("in Hisui");
  });
  it("says nothing when the whole line is that form, or there is no form", () => {
    expect(evoWhere(byName("Raticate Alola"))).toBeNull();
    expect(evoWhere(byName("Weezing"))).toBeNull();
    expect(evoWhere(byName("Wormadam Sandy") || byName("Wormadam Sandy") || {})).toBeNull();
  });
});

describe("evolutionLine", () => {
  it("lists both Weezings under Koffing", () => {
    const line = evolutionLine(byName("Koffing"));
    expect(line.levels[1].map((p) => p.displayName)).toEqual(["Weezing", "Weezing Galar"]);
  });
});

describe("evolutionTree", () => {
  it("joins each Pokémon to its own evolutions", () => {
    const { root } = evolutionTree(byName("Goomy"));
    const names = (n) => [n.pokemon.displayName, n.children.map(names)];
    expect(names(root)).toEqual([
      "Goomy",
      [
        ["Sliggoo", [["Goodra", []]]],
        ["Sliggoo Hisui", [["Goodra Hisui", []]]],
      ],
    ]);
  });
  it("is null for a Pokémon that doesn't evolve", () => {
    expect(evolutionTree(byName("Ditto"))).toBeNull();
  });
});

describe("shortHow", () => {
  it("keeps every method short enough for a square tile", () => {
    for (const p of POKEMON) if (p.evoDetail) expect(shortHow(p.evoDetail).length, p.displayName).toBeLessThanOrEqual(31);
  });
  it("phrases Tyrogue's three as Attack against Defense", () => {
    expect(shortHow(byName("Hitmontop").evoDetail)).toBe("Level 20 with Attack = Defense");
  });
});

describe("evoNote", () => {
  it("tells apart every branch whose sides share a dex line", () => {
    expect(evoNote(byName("Solgaleo"))).toBe("in Sun / Scarlet");
    expect(evoNote(byName("Lunala"))).toBe("in Moon / Violet");
    expect(evoNote(byName("Silcoon"))).toBe("Random");
    expect(evoNote(byName("Wormadam Sandy"))).toBe("Female, Cave Battle");
    expect(evoNote(byName("Mothim"))).toBe("Male");
    expect(evoNote(byName("Gallade"))).toBe("Male");
    expect(evoNote(byName("Froslass"))).toBe("Female");
    expect(evoNote(byName("Weezing Galar"))).toBe("in Galar");
    expect(evoNote(byName("Goodra"))).toBeNull();
  });
  it("leaves no branch with two sides reading the same (bar Wurmple's coin toss)", () => {
    const kids = new Map();
    for (const p of POKEMON) if (p.prevo != null) kids.set(p.prevo, [...(kids.get(p.prevo) || []), p]);
    for (const [, ks] of kids) {
      const labels = ks.map((k) => shortHow(k.evoDetail) + (evoNote(k) || ""));
      const distinct = new Set(labels).size;
      const names = ks.map((k) => k.displayName).join("/");
      expect(distinct, names).toBe(names === "Silcoon/Cascoon" ? 1 : ks.length);
    }
  });
});

describe("titleCase", () => {
  it("capitalises the words that matter", () => {
    expect(titleCase("Lv 20, female, cave battle")).toBe("Lv 20, Female, Cave Battle");
    expect(titleCase("Leaf Stone / Moss Rock")).toBe("Leaf Stone / Moss Rock");
    expect(titleCase("Level 20 with Attack > Defense")).toBe("Level 20 with Attack > Defense");
    expect(titleCase("in Galar", true)).toBe("in Galar");
    expect(titleCase("Friendship + Fairy move")).toBe("Friendship + Fairy Move");
    expect(titleCase("Trade with a Karrablast")).toBe("Trade with a Karrablast");
  });
});

describe("dex order", () => {
  it("keeps a form beside its base, not after later species", () => {
    const { root } = evolutionTree(byName("Burmy"));
    expect(root.children.map((c) => c.pokemon.displayName)).toEqual(["Wormadam Plant", "Wormadam Sandy", "Wormadam Trash", "Mothim"]);
  });
});

describe("display-only forms", () => {
  it("draw in the tree but are never answers", () => {
    const { root } = evolutionTree(byName("Rockruff"));
    expect(root.children.map((c) => c.pokemon.displayName)).toEqual(["Lycanroc Midday", "Lycanroc Midnight"]);
    // Dusk Lycanroc comes from Own Tempo Rockruff, a form of its own
    expect(evolutionTree(byName("Lycanroc Dusk")).root.pokemon.displayName).toBe("Rockruff Own Tempo");
    expect(byName("Lycanroc Midnight").answer).toBe(false);
    expect(evolutionTree(byName("Toxel")).root.children.map((c) => c.pokemon.displayName)).toEqual(["Toxtricity Amped", "Toxtricity Low Key"]);
    // PokeDoku names both Meowstics, so both are branches
    expect(evolutionTree(byName("Espurr")).root.children.map((c) => c.pokemon.displayName)).toEqual(["Meowstic Male", "Meowstic Female"]);
  });
});
