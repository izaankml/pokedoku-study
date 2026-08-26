import { describe, expect, it } from "vitest";
import { POKEMON_BY_ID } from "../data/pokedex.ts";
import { DECKS, DECK_BY_ID, allCardKeys, cardKey, deckPool, filterFor, passesFilter } from "./flashcards.ts";
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

  it("marks the pick-everything decks as multi-select", () => {
    expect(DECKS.filter((each) => each.multi).map((each) => each.id)).toEqual([
      "region", "type", "method", "matchup", "combo",
    ]);
    expect(deck("method").implies).toEqual({ "evo-stone": ["evo-item"], "evo-friendship": ["evo-level"] });
  });

  it("covers every category group in Stats except Type Count (the Type deck implies it)", () => {
    expect(DECKS.map((each) => each.id)).toEqual([
      "region", "type", "method", "stage", "branched", "special", "move", "matchup", "name", "ability", "combo",
    ]);
  });

  it("combo cards union their sub-decks' answers", () => {
    const combo = deck("combo");
    expect(combo.answers(by("koraidon"), "type+special")).toEqual([
      "type-fighting", "type-dragon", "flag-legendary", "flag-paradox",
    ]);
    expect(combo.question("type+region")).toBe("Pick every answer: Type + Region");
    // an in-no-group Pokémon can only be asked group-free combos
    expect(combo.eligible(by("pikachu"))).toBe(true); // type+region
    expect(combo.pickParam?.(by("pikachu"), () => 0)).toBe("type+region");
    // "none" flows through from the Ability sub-deck
    expect(combo.answers(by("gengar"), "type+special+ability")).toContain("none");
    expect(combo.categories(by("gengar"), "type+special+ability")).not.toContain("none");
  });

  it("asks matchup weaknesses and typed names", () => {
    const matchup = deck("matchup");
    // Charizard (Fire/Flying): Water, Electric, Rock
    expect(matchup.answers(by("charizard"))).toEqual(["type-water", "type-electric", "type-rock"]);
    expect(matchup.categories(by("charizard"))).toEqual([]); // never pollutes type accuracy
    // Gmax keeps its base's typing, so it is never asked; a type-changing
    // Mega is, with its own weaknesses
    expect(deckPool(matchup)).not.toContain(by("charizardgmax"));
    expect(matchup.answers(by("charizardmegax"))).toEqual(["type-ground", "type-rock", "type-dragon"]);
    const name = deck("name");
    expect(name.answers(by("pikachu"))).toEqual([String(by("pikachu").id)]);
    expect(name.input).toBe("name");
    expect(deckPool(name)).toContain(by("charizardmegax")); // forms are their own card
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

  it("filters keep the Pokémon that have some chosen answer", () => {
    const region = deck("region");
    // empty, missing, or all-selected lists mean no filter
    expect(filterFor({}, "region")).toBe(null);
    expect(filterFor({ region: [] }, "region")).toBe(null);
    expect(filterFor({ region: region.options.map((option) => option.id) }, "region")).toBe(null);
    const unovaOnly = filterFor({ region: ["region-unova"] }, "region");
    expect(unovaOnly).toEqual(new Set(["region-unova"]));
    expect(passesFilter(region, by("snivy"), unovaOnly)).toBe(true);
    expect(passesFilter(region, by("pikachu"), unovaOnly)).toBe(false);
    // a dual-region form counts for either of its regions
    expect(passesFilter(region, by("basculinwhitestriped"), unovaOnly)).toBe(true);
    // "Stone only" keeps stone evolvers even though stone implies item
    expect(passesFilter(deck("method"), by("raichu"), new Set(["evo-stone"]))).toBe(true);
    expect(passesFilter(deck("method"), by("alakazam"), new Set(["evo-stone"]))).toBe(false);
    // "Levitate only" skips the many whose answer is None of These
    expect(passesFilter(deck("ability"), by("gengar"), new Set(["ability-levitate"]))).toBe(false);
    // the Move deck filters the asked move, not the Pokémon
    expect(passesFilter(deck("move"), by("pikachu"), new Set(["move-surf"]))).toBe(true);
    expect(deck("move").pickParam?.(by("pikachu"), () => 0.9, new Set(["move-surf"]))).toBe("surf");
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
