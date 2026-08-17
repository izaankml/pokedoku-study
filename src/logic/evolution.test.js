import { describe, expect, it } from "vitest";
import { POKEMON } from "../data/pokedex.js";
import { evoWhere, evolutionLine } from "./evolution.js";

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
