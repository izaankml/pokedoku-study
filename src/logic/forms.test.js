import { describe, expect, it } from "vitest";
import { ALL_POKEMON as POKEMON } from "../data/pokedex.js";
import { baseOf, counterpartsOf, formLabel, formTrigger, formsOf, formsRow, isTransformation, variantNote, variantsOf } from "./forms.js";

const byName = (n) => POKEMON.find((p) => p.displayName === n || p.altName === n);

describe("forms", () => {
  it("knows every transformation's trigger", () => {
    for (const p of POKEMON) if (isTransformation(p)) expect(formTrigger(p), p.displayName).toMatch(/^(?!.*undefined).+/);
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
    expect(baseOf(byName("Urshifu Rapid Strike Gmax")).displayName).toBe("Urshifu Rapid Strike");
    expect(baseOf(byName("Toxtricity Low Key Gmax")).displayName).toBe("Toxtricity Low Key");
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

describe("variants", () => {
  it("are the species' other non-transformation forms", () => {
    expect(variantsOf(byName("Zarude")).map((p) => p.displayName)).toEqual(["Zarude Dada"]);
    expect(variantsOf(byName("Rockruff")).map((p) => p.displayName)).toEqual(["Rockruff Own Tempo"]);
    expect(variantsOf(byName("Vulpix")).map((p) => p.displayName)).toEqual(["Vulpix Alola"]);
    expect(variantsOf(byName("Charizard"))).toEqual([]); // Megas and Gmax are transformations
    expect(variantNote(byName("Vulpix Alola"))).toBe("Alolan Form");
    expect(variantNote(byName("Zarude Dada"))).toBe("Dada's Cloth");
    expect(formTrigger(byName("Meowstic Mega"))).toBe("Meowsticite");
    expect(formTrigger(byName("Tatsugiri Droopy Mega"))).toBe("Tatsugirinite");
    expect(counterpartsOf(byName("Tatsugiri Curly Mega")).map((p) => p.displayName)).toEqual(["Tatsugiri Droopy Mega", "Tatsugiri Stretchy Mega"]);
  });
});

describe("PokeDoku names", () => {
  it("names a base species by its form where PokeDoku does, keeping the plain name searchable", () => {
    const l = byName("Lycanroc");
    expect(l.displayName).toBe("Lycanroc Midday");
    expect(l.altName).toBe("Lycanroc");
    expect(l.speciesName).toBe("Lycanroc");
    expect(formLabel(byName("Lycanroc Midnight"))).toBe("Midnight");
    expect(byName("Toxtricity").displayName).toBe("Toxtricity Amped");
  });
});

describe("formsRow", () => {
  const names = (p) => formsRow(p).map((t) => t.displayName);
  it("relates only what's direct, the Pokémon itself included once: Darmanitan", () => {
    expect(names(byName("Darmanitan Standard"))).toEqual(["Darmanitan Standard", "Darmanitan Zen", "Darmanitan Galar Standard"]);
    expect(names(byName("Darmanitan Zen"))).toEqual(["Darmanitan Standard", "Darmanitan Zen", "Darmanitan Galar Zen"]);
    expect(names(byName("Darmanitan Galar Standard"))).toEqual(["Darmanitan Standard", "Darmanitan Galar Standard", "Darmanitan Galar Zen"]);
    expect(names(byName("Darmanitan Galar Zen"))).toEqual(["Darmanitan Zen", "Darmanitan Galar Standard", "Darmanitan Galar Zen"]);
    expect(names(byName("Venusaur"))).toEqual(["Venusaur", "Venusaur Mega", "Venusaur Gmax"]);
    expect(names(byName("Pyroar Female"))).toEqual(["Pyroar Male", "Pyroar Mega", "Pyroar Female"]);
    expect(names(byName("Pyroar Mega"))).toEqual(["Pyroar Male", "Pyroar Mega", "Pyroar Female"]);
    expect(names(byName("Minior Meteor")).slice(0, 3)).toEqual(["Minior Meteor", "Minior Red", "Minior Orange"]);
    expect(names(byName("Charizard Mega X"))).toEqual(["Charizard", "Charizard Mega X", "Charizard Mega Y", "Charizard Gmax"]);
  });
  it("shows every Lycanroc on every Lycanroc, and Gigantamax Urshifu as counterparts", () => {
    expect(names(byName("Lycanroc Midnight"))).toEqual(["Lycanroc Midday", "Lycanroc Midnight", "Lycanroc Dusk"]);
    expect(counterpartsOf(byName("Urshifu Rapid Strike Gmax")).map((p) => p.displayName)).toEqual(["Urshifu Single Strike Gmax"]);
    expect(names(byName("Charmander"))).toEqual([]);
  });
});

describe("Forms rows hang together", () => {
  it("are symmetric: whoever a sheet shows, shows that sheet back", () => {
    for (const p of POKEMON) {
      for (const t of formsRow(p).filter((t) => t.id !== p.id)) {
        expect(formsRow(t).map((x) => x.id), `${t.displayName} should show ${p.displayName} back`).toContain(p.id);
      }
    }
  });
  it("show the sheet's own Pokémon exactly once, in dex order", () => {
    for (const p of POKEMON) {
      const ids = formsRow(p).map((t) => t.id);
      if (!ids.length) continue;
      expect(ids.filter((id) => id === p.id).length, p.displayName).toBe(1);
      expect([...ids].sort((a, b) => a - b), p.displayName).toEqual(ids);
    }
  });
});
