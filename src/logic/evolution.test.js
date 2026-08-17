import { describe, expect, it } from "vitest";
import { POKEMON } from "../data/pokedex.js";
import { evoWhere, evolutionLine, evolutionTree, shortHow } from "./evolution.js";

const byName = (n) => POKEMON.find((p) => p.displayName === n);

describe("evoWhere", () => {
  it("names the region for a regional form that evolves from another form", () => {
    expect(evoWhere(byName("Weezing Galar"))).toBe("in Galar");
    expect(evoWhere(byName("Raichu Alola"))).toBe("in Alola");
    expect(evoWhere(byName("Typhlosion Hisui"))).toBe("in Hisui");
  });
  it("says nothing when the whole line is that form, or there is no form", () => {
    expect(evoWhere(byName("Raticate Alola"))).toBeNull();
    expect(evoWhere(byName("Weezing"))).toBeNull();
    expect(evoWhere(byName("Wormadam Sandy") || byName("Wormadam (Sandy)") || {})).toBeNull();
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
