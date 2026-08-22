import { describe, expect, it } from "vitest";
import { ALL_POKEMON as POKEMON } from "../data/pokedex.ts";
import type { Pokemon } from "../data/types.ts";
import { evoNote, evoWhere, evolutionTree, shortHow, titleCase } from "./evolution.ts";
import type { EvolutionNode, EvolutionTree } from "./evolution.ts";

const byName = (name: string): Pokemon => {
  const pokemon = POKEMON.find((candidate) => candidate.displayName === name || candidate.altName === name);
  if (!pokemon) throw new Error(`no such Pokémon: ${name}`);
  return pokemon;
};
const treeOf = (name: string): EvolutionTree => evolutionTree(byName(name));
const detailOf = (name: string): string => byName(name).evoDetail ?? "";
// (NFC, so "Flabébé" compares equal however the dex spells its accents)
const names = (node: EvolutionNode): unknown[] => [node.pokemon.displayName.normalize("NFC"), node.children.map(names)];

describe("evoWhere", () => {
  it("names the region for a regional form that evolves from another form", () => {
    expect(evoWhere(byName("Weezing Galar"))).toBe("in Galar");
    expect(evoWhere(byName("Raichu Alola"))).toBe("in Alola");
    expect(evoWhere(byName("Typhlosion Hisui"))).toBe("in Hisui");
  });
  it("says nothing when the whole line is that form, or there is no form", () => {
    expect(evoWhere(byName("Raticate Alola"))).toBeNull();
    expect(evoWhere(byName("Weezing"))).toBeNull();
    expect(evoWhere(byName("Wormadam Sandy"))).toBeNull();
  });
});

describe("evolutionTree", () => {
  it("lists both Weezings under Koffing", () => {
    expect(treeOf("Koffing").root.children.map((child) => child.pokemon.displayName)).toEqual(["Weezing", "Weezing Galar"]);
  });
  it("joins each Pokémon to its own evolutions", () => {
    const { root } = treeOf("Goomy");
    expect(names(root)).toEqual([
      "Goomy",
      [
        ["Sliggoo", [["Goodra", []]]],
        ["Sliggoo Hisui", [["Goodra Hisui", []]]],
      ],
    ]);
  });
  it("is a tree of one for a Pokémon that doesn't evolve", () => {
    const tree = treeOf("Ditto");
    expect(names(tree.root)).toEqual(["Ditto", []]);
    expect(tree.coRoots).toEqual([]);
    expect([...tree.focusIds]).toEqual([byName("Ditto").id]);
  });
  it("stacks both Gimmighoul forms before Gholdengo, whichever of the three is asked", () => {
    for (const name of ["Gimmighoul", "Gimmighoul Roaming", "Gholdengo"]) {
      const tree = treeOf(name);
      expect(names(tree.root), name).toEqual(["Gimmighoul", [["Gholdengo", []]]]);
      expect(tree.coRoots.map((p) => p.displayName), name).toEqual(["Gimmighoul Roaming"]);
      expect([...tree.focusIds], name).toEqual([byName(name).id]);
    }
    expect(byName("Gimmighoul Roaming").stage).toBe("first");
  });
  it("gives a male Burmy of any cloak Mothim, without merging the cloaks' trees", () => {
    expect(names(treeOf("Burmy Sandy Cloak").root)).toEqual(["Burmy Sandy Cloak", [["Wormadam Sandy", []], ["Mothim", []]]]);
    expect(names(treeOf("Wormadam Trash").root)).toEqual(["Burmy Trash Cloak", [["Wormadam Trash", []], ["Mothim", []]]]);
    expect(treeOf("Burmy Sandy Cloak").coRoots).toEqual([]);
    // Mothim itself shows the default (Plant Cloak) line
    const mothim = treeOf("Mothim");
    expect(names(mothim.root)).toEqual(["Burmy Plant Cloak", [["Wormadam Plant", []], ["Mothim", []]]]);
    expect(mothim.coRoots).toEqual([]);
  });
  it("draws a cosmetic clone with no line of its own on its species' line", () => {
    const tree = treeOf("Caterpie Cowboy Hat");
    expect(names(tree.root)).toEqual(["Caterpie", [["Metapod", [["Butterfree", []]]]]]);
    expect([...tree.focusIds]).toEqual([byName("Caterpie").id]);
  });
  it("highlights both Meowstics (and both Pyroars) for their shared Mega", () => {
    expect([...treeOf("Meowstic Mega").focusIds]).toEqual([byName("Meowstic Male").id, byName("Meowstic Female").id]);
    expect([...treeOf("Pyroar Mega").focusIds]).toEqual([byName("Pyroar Male").id, byName("Pyroar Female").id]);
    expect([...treeOf("Charizard Mega X").focusIds]).toEqual([byName("Charizard").id]);
    expect([...treeOf("Meowstic Female").focusIds]).toEqual([byName("Meowstic Female").id]);
  });
  it("gives Mega Floette Eternal Flower Floette's line — none — not Floette's", () => {
    expect(names(treeOf("Floette Mega").root)).toEqual(["Floette Eternal", []]);
    expect(names(treeOf("Floette Eternal").root)).toEqual(["Floette Eternal", []]);
    expect(names(treeOf("Floette").root)).toEqual(["Flabébé", [["Floette", [["Florges", []]]]]]);
  });
});

describe("shortHow", () => {
  it("keeps every method short enough for a square tile", () => {
    for (const p of POKEMON) if (p.evoDetail) expect(shortHow(p.evoDetail).length, p.displayName).toBeLessThanOrEqual(31);
  });
  it("phrases Tyrogue's three as Attack against Defense", () => {
    expect(shortHow(detailOf("Hitmontop"))).toBe("Level 20 with Attack = Defense");
  });
});

describe("evoNote", () => {
  it("tells apart every branch whose sides share a dex line", () => {
    expect(evoNote(byName("Solgaleo"))).toBe("in Sun / Scarlet");
    expect(evoNote(byName("Lunala"))).toBe("in Moon / Violet");
    expect(evoNote(byName("Silcoon"))).toBe("Random");
    expect(evoNote(byName("Wormadam Sandy"))).toBe("Female");
    expect(evoNote(byName("Mothim"))).toBe("Male");
    expect(evoNote(byName("Gallade"))).toBe("Male");
    expect(evoNote(byName("Froslass"))).toBe("Female");
    expect(evoNote(byName("Weezing Galar"))).toBe("in Galar");
    expect(evoNote(byName("Goodra"))).toBeNull();
  });
  it("leaves no branch with two sides reading the same (bar Wurmple's coin toss)", () => {
    const kids = new Map<number, Pokemon[]>();
    for (const p of POKEMON) if (p.prevo != null) kids.set(p.prevo, [...(kids.get(p.prevo) || []), p]);
    for (const [, ks] of kids) {
      const labels = ks.map((k) => shortHow(k.evoDetail ?? "") + (evoNote(k) || ""));
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
    const { root } = treeOf("Burmy");
    expect(root.children.map((c) => c.pokemon.displayName)).toEqual(["Wormadam Plant", "Mothim"]); // each cloak is its own Burmy
    expect(treeOf("Wormadam Sandy").root.pokemon.displayName).toBe("Burmy Sandy Cloak");
    expect(treeOf("Litleo").root.children.map((c) => c.pokemon.displayName)).toEqual(["Pyroar Male", "Pyroar Female"]);
  });
});

describe("display-only forms", () => {
  it("draw in the tree but are never answers", () => {
    const { root } = treeOf("Rockruff");
    expect(root.children.map((c) => c.pokemon.displayName)).toEqual(["Lycanroc Midday", "Lycanroc Midnight"]);
    // Dusk Lycanroc comes from Own Tempo Rockruff, a form of its own
    expect(treeOf("Lycanroc Dusk").root.pokemon.displayName).toBe("Rockruff Own Tempo");
    expect(byName("Lycanroc Midnight").answer).toBe(false);
    expect(treeOf("Toxel").root.children.map((c) => c.pokemon.displayName)).toEqual(["Toxtricity Amped", "Toxtricity Low Key"]);
    // PokeDoku names both Meowstics, so both are branches
    expect(treeOf("Espurr").root.children.map((c) => c.pokemon.displayName)).toEqual(["Meowstic Male", "Meowstic Female"]);
  });
});
