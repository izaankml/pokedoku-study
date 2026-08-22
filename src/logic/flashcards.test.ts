import { describe, expect, it } from "vitest";
import { POKEMON_BY_ID } from "../data/pokedex.ts";
import { DECKS, DECK_BY_ID, allCardKeys, cardKey, deckPool } from "./flashcards.ts";
import type { Deck } from "./flashcards.ts";
import type { Pokemon } from "../data/types.ts";
import { pickFlashcard } from "./picker.ts";
import { mergeBlocks } from "./stats.ts";

const by = (name: string): Pokemon => {
  const pokemon = [...POKEMON_BY_ID.values()].find((candidate) => candidate.name === name);
  if (!pokemon) throw new Error(`no such Pokémon: ${name}`);
  return pokemon;
};
const deck = (id: string): Deck => {
  const found = DECK_BY_ID.get(id);
  if (!found) throw new Error(`no such deck: ${id}`);
  return found;
};

describe("flashcard decks", () => {
  it("answer with every category the Pokémon counts for", () => {
    const region = deck("region");
    expect(region.answers(by("growlithehisui"))).toEqual(["region-hisui"]);
    expect(region.answers(by("basculinwhitestriped"))).toEqual(["region-unova", "region-hisui"]);
    const special = deck("special");
    expect(special.answers(by("koraidon"))).toEqual(["flag-legendary", "flag-paradox"]);
    expect(special.eligible(by("pikachu"))).toBe(false); // regular Pokémon aren't asked
    const method = deck("method");
    expect(method.answers(by("alakazam"))).toEqual(["evo-trade", "evo-item"]);
    const type = deck("type");
    expect(type.answers(by("charizardmegax"))).toEqual(["type-fire", "type-dragon"]);
    expect(deck("branched").answers(by("eevee"))).toEqual(["yes"]);
    const move = deck("move");
    expect(move.answers(by("pikachu"), "surf")).toEqual(["yes"]);
    expect(move.answers(by("charizard"), "surf")).toEqual(["no"]);
    expect(move.categories(by("charizard"), "surf")).toEqual(["move-surf"]);
    expect(move.question("earthquake")).toBe("Can this Pokémon learn Earthquake?");
    expect(deck("ability").answers(by("gyarados"))).toContain("ability-intimidate");
    expect(deck("ability").answers(by("gengar"))).toEqual(["none"]);
  });

  it("marks Type and Region as multi-select (both types / regions needed)", () => {
    expect(DECKS.filter((d) => d.multi).map((d) => d.id)).toEqual(["region", "type", "method"]);
    expect(deck("method").implies).toEqual({ "evo-stone": ["evo-item"], "evo-friendship": ["evo-level"] });
  });

  it("covers every category group in Stats except Type Count (the Type deck implies it)", () => {
    expect(DECKS.map((d) => d.id)).toEqual([
      "region", "type", "method", "stage", "branched", "special", "move", "ability",
    ]);
  });

  it("only asks about forms whose answer differs from the base species", () => {
    const region = deckPool(deck("region"));
    expect(region).toContain(by("basculinwhitestriped")); // Unova and Hisui, unlike Basculin
    expect(region).toContain(by("ursalunabloodmoon"));
    expect(region).not.toContain(by("charizardmegax")); // same region as Charizard
    expect(region).not.toContain(by("meltan")); // no region at all
    // regional forms answer themselves by name
    expect(region).not.toContain(by("growlithehisui"));
    expect(region).not.toContain(by("taurospaldeacombat"));
    expect(region).not.toContain(by("darmanitangalarzen"));
    expect(region.some((pokemon) => /^(Alola|Galar|Hisui|Paldea)/.test(pokemon.form ?? ""))).toBe(false);
    // species from those regions — and the evolutions of regional forms — are still asked
    for (const name of ["sneasler", "cursola", "perrserker", "sirfetchd", "mrrime", "runerigus", "obstagoon", "kleavor", "wyrdeer", "overqwil", "basculegion", "enamorus"]) {
      expect(region, name).toContain(by(name));
    }
    const special = deckPool(deck("special"));
    expect(special).not.toContain(by("typhlosionhisui")); // starter, same as Typhlosion
    expect(special).toContain(by("koraidon"));
    expect(special).not.toContain(by("greninjaash")); // in no group, so never asked
    expect(special).not.toContain(by("charizardgmax")); // Mega/Gmax never asked
    const method = deckPool(deck("method"));
    expect(method).toContain(by("persianalola")); // friendship, unlike Persian
    expect(method).not.toContain(by("eevee")); // nothing to ask
    const type = deckPool(deck("type"));
    expect(type).toContain(by("charizardmegax")); // Fire/Dragon, unlike Charizard
    expect(type).not.toContain(by("charizardmegay")); // same types
    expect(deckPool(deck("branched"))).not.toContain(by("charizard")); // final stage
  });

  it("keeps the region deck's stats keys backwards compatible", () => {
    expect(cardKey(deck("region"), by("pikachu"))).toBe("25");
    expect(cardKey(deck("special"), by("pikachu"))).toBe("special:25");
    const keys = allCardKeys();
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBe(DECKS.reduce((n, d) => n + deckPool(d).length, 0));
  });

  it("picks from the requested deck, or any deck", () => {
    const merged = mergeBlocks([]);
    for (let i = 0; i < 20; i++) {
      const { deck } = pickFlashcard(merged, { deckId: "special", random: () => i / 20 });
      expect(deck.id).toBe("special");
    }
    const seen = new Set();
    for (let i = 0; i < 40; i++) {
      seen.add(pickFlashcard(merged, { deckId: "all", random: () => i / 40 }).deck.id);
    }
    expect(seen.size).toBeGreaterThan(1);
    const moveCard = pickFlashcard(merged, { deckId: "move", random: () => 0.3 });
    expect(typeof moveCard.param).toBe("string");
    expect(pickFlashcard(merged, { deckId: "region", random: () => 0.3 }).param).toBe(null);
  });
});
