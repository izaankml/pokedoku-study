import { describe, expect, it } from "vitest";
import { ALL_POKEMON as POKEMON } from "../data/pokedex.ts";
import type { Pokemon } from "../data/types.ts";
import {
  baseOf,
  counterpartsOf,
  formLabel,
  formRank,
  formTrigger,
  formsOf,
  formsRow,
  isTemporary,
  isTransformation,
  sharersOf,
  variantNote,
  variantsOf,
} from "./forms.ts";

const byName = (name: string): Pokemon => {
  const pokemon = POKEMON.find((candidate) => candidate.displayName === name || candidate.altName === name);
  if (!pokemon) throw new Error(`no such Pokémon: ${name}`);
  return pokemon;
};

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
    // only Eternal Flower Floette Mega Evolves
    expect(baseOf(byName("Floette Mega")).displayName).toBe("Floette Eternal");
    expect(formsOf(byName("Floette"))).toEqual([]);
    expect(formsOf(byName("Floette Eternal")).map((p) => p.displayName)).toEqual(["Floette Mega"]);
    expect(formTrigger(byName("Floette Mega"))).toBe("Floettite");
  });
  it("tells the battle-only transformations from the lasting ones", () => {
    for (const n of ["Charizard Mega X", "Charizard Gmax", "Groudon Primal", "Darmanitan Zen", "Greninja Ash", "Zacian Crowned", "Eternatus Eternamax", "Terapagos Terastal", "Meloetta Pirouette"]) {
      expect(isTemporary(byName(n)), n).toBe(true);
    }
    for (const n of ["Rotom Wash", "Deoxys Attack", "Dialga Origin", "Shaymin Sky", "Kyurem Black", "Hoopa Unbound", "Calyrex Ice", "Ogerpon Wellspring Mask", "Rattata Alola", "Charizard"]) {
      expect(isTemporary(byName(n)), n).toBe(false);
    }
  });
  it("knows which gender forms share a transformation", () => {
    expect(sharersOf(byName("Meowstic Mega")).map((p) => p.displayName)).toEqual(["Meowstic Female"]);
    expect(sharersOf(byName("Pyroar Mega")).map((p) => p.displayName)).toEqual(["Pyroar Female"]);
    expect(sharersOf(byName("Charizard Mega X"))).toEqual([]);
    expect(sharersOf(byName("Pyroar Female"))).toEqual([]);
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
    expect(byName("Galarian Mr. Mime").displayName).toBe("Mr. Mime Galar");
    expect(byName("Caterpie (Cowboy-Hat)").displayName).toBe("Caterpie Cowboy Hat");
  });
});

describe("formsRow", () => {
  const names = (p: Pokemon) => formsRow(p).map((t) => t.displayName);
  it("relates only what's direct, the Pokémon itself included once: Darmanitan", () => {
    expect(names(byName("Darmanitan Zen"))).toEqual(["Darmanitan Standard", "Darmanitan Zen", "Darmanitan Galar Zen"]);
    expect(names(byName("Darmanitan Galar Standard"))).toEqual(["Darmanitan Standard", "Darmanitan Galar Standard", "Darmanitan Galar Zen"]);
    expect(names(byName("Darmanitan Galar Zen"))).toEqual(["Darmanitan Galar Standard", "Darmanitan Zen", "Darmanitan Galar Zen"]);
    expect(names(byName("Venusaur"))).toEqual(["Venusaur", "Venusaur Mega", "Venusaur Gmax"]);
    expect(names(byName("Pyroar Female"))).toEqual(["Pyroar Male", "Pyroar Female", "Pyroar Mega"]);
    expect(names(byName("Pyroar Mega"))).toEqual(["Pyroar Male", "Pyroar Female", "Pyroar Mega"]);
    expect(names(byName("Slowbro"))).toEqual(["Slowbro", "Slowbro Galar", "Slowbro Mega"]);
    expect(names(byName("Darmanitan Standard"))).toEqual(["Darmanitan Standard", "Darmanitan Galar Standard", "Darmanitan Zen"]);
    expect(names(byName("Meowstic Female"))).toEqual(["Meowstic Male", "Meowstic Female", "Meowstic Mega"]);
    expect(names(byName("Minior Meteor")).slice(0, 3)).toEqual(["Minior Meteor", "Minior Red", "Minior Orange"]);
    expect(names(byName("Charizard Mega X"))).toEqual(["Charizard", "Charizard Mega X", "Charizard Mega Y", "Charizard Gmax"]);
    expect(names(byName("Floette"))).toEqual(["Floette", "Floette Eternal"]);
    expect(names(byName("Floette Eternal"))).toEqual(["Floette", "Floette Eternal", "Floette Mega"]);
    expect(names(byName("Floette Mega"))).toEqual(["Floette Eternal", "Floette Mega"]);
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
  it("show the sheet's own Pokémon exactly once, base forms → transformations → Megas → Gigantamax", () => {
    for (const p of POKEMON) {
      const row = formsRow(p);
      if (!row.length) continue;
      expect(row.filter((t) => t.id === p.id).length, p.displayName).toBe(1);
      const keys = row.map((t) => [formRank(t), t.id]);
      expect([...keys].sort((a, b) => a[0] - b[0] || a[1] - b[1]), p.displayName).toEqual(keys);
    }
  });
});
