import { describe, expect, it } from "vitest";
import { ALL_POKEMON as POKEMON } from "../data/pokedex.js";
import { baseOf, formLabel, formTrigger, formsOf, isTransformation } from "./forms.js";

const byName = (n) => POKEMON.find((p) => p.displayName === n);

describe("forms", () => {
  it("knows every transformation's trigger", () => {
    for (const p of POKEMON) if (isTransformation(p)) expect(formTrigger(p), p.displayName).toBeTruthy();
  });
  it("names Mega Stones, old and Z-A", () => {
    expect(formTrigger(byName("Charizard Mega X"))).toBe("Charizardite X");
    expect(formTrigger(byName("Blastoise Mega"))).toBe("Blastoisinite");
    expect(formTrigger(byName("Absol Mega Z"))).toBe("Absolite Z");
    expect(formTrigger(byName("Raichu Mega Y"))).toBe("Raichunite Y");
    expect(formTrigger(byName("Rayquaza Mega"))).toBe("Dragon Ascent");
    expect(formTrigger(byName("Charizard Gmax"))).toBe("Gigantamax Factor");
  });
  it("attaches forms to their base, a form of a form to that form", () => {
    expect(formsOf(byName("Charizard")).map((p) => p.displayName)).toEqual(["Charizard Mega X", "Charizard Mega Y", "Charizard Gmax"]);
    expect(baseOf(byName("Darmanitan Galar Zen")).displayName).toBe("Darmanitan Galar Standard");
    expect(formsOf(byName("Rotom")).length).toBe(5);
    expect(formsOf(byName("Kyurem")).map((p) => p.displayName)).toEqual(["Kyurem Black", "Kyurem White"]);
    expect(formTrigger(byName("Kyogre Primal"))).toBe("Blue Orb");
  });
  it("labels a form by its own name", () => {
    expect(formLabel(byName("Charizard Mega X"))).toBe("Mega X");
    expect(formLabel(byName("Rotom Wash"))).toBe("Wash");
    expect(formLabel(byName("Necrozma Dusk"))).toBe("Dusk");
  });
  it("leaves variants alone", () => {
    for (const n of ["Rattata Alola", "Wormadam Sandy", "Pikachu Partner", "Ursaluna Bloodmoon", "Urshifu Rapid Strike"]) {
      expect(isTransformation(byName(n)), n).toBe(false);
    }
  });
});
