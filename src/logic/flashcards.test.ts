import { describe, expect, it } from "vitest";
import { NATURES, NATURE_BY_ID } from "../data/natures.ts";
import { POKEMON_BY_ID } from "../data/pokedex.ts";
import {
  COMBO_IDS,
  DECKS,
  DECK_BY_ID,
  allCardKeys,
  cardKey,
  dealtDeckIds,
  deckAnswers,
  deckCategories,
  deckEligible,
  deckLabel,
  deckParts,
  deckPicks,
  deckPool,
  dueCardCount,
  facetCategories,
  focusedDeckPool,
  isDeckId,
  isNature,
  isRightPick,
  matchesFocus,
  partAnswers,
  subjectOf,
} from "./flashcards.ts";
import type { Deck, PokemonDeck, Subject } from "./flashcards.ts";
import type { Pokemon } from "../data/types.ts";
import { pickFlashcard } from "./picker.ts";
import { emptyBlock, mergeBlocks } from "./stats.ts";

const by = (name: string): Pokemon => {
  const pokemon = [...POKEMON_BY_ID.values()].find((candidate) => candidate.name === name);
  if (!pokemon) throw new Error(`no such Pokémon: ${name}`);
  return pokemon;
};
const asPokemon = (subject: Subject): Pokemon => {
  if (isNature(subject)) throw new Error(`a nature where a Pokémon was expected: ${subject.id}`);
  return subject;
};
const deck = (id: string): PokemonDeck => {
  const found = DECK_BY_ID.get(id);
  if (!found || "about" in found) throw new Error(`no such Pokémon deck: ${id}`);
  return found;
};

describe("flashcard decks", () => {
  it("offers the four deckable groups, Matchups, Who's That and Natures, plus the six pairwise combos", () => {
    expect(DECKS.map((each) => each.id)).toEqual(["region", "type", "special", "stage", "matchup", "name", "nature"]);
    expect(COMBO_IDS).toEqual([
      "combo:type+region",
      "combo:type+stage",
      "combo:type+special",
      "combo:region+stage",
      "combo:region+special",
      "combo:stage+special",
    ]);
    expect(deckLabel("all")).toBe("All decks");
    expect(deckLabel("combo:type+region")).toBe("Type × Region");
    expect(isDeckId("combo:type+region")).toBe(true);
    expect(isDeckId("combo:region+type")).toBe(false); // only the listed combos
    expect(isDeckId("method")).toBe(false);
  });

  it("lets Who's That take any name of a form that looks the same, and deals the group once", () => {
    const name = deck("name");
    const gourgeist = by("gourgeist");
    const large = by("gourgeistlarge");
    expect(name.answers(large)).toEqual(name.answers(gourgeist));
    expect(name.answers(gourgeist)).toContain(String(large.id));
    expect(isRightPick(name, [String(gourgeist.id)], name.answers(large))).toBe(true);
    expect(name.answers(by("pikachustarter"))).toEqual([String(by("pikachu").id), String(by("pikachustarter").id)]);
    expect(name.answers(by("rockruffdusk"))).toEqual(name.answers(by("rockruff")));
    // a recolour is its own answer
    expect(name.answers(by("electrodehisui"))).toEqual([String(by("electrodehisui").id)]);
    expect(name.answers(by("charizard"))).toEqual([String(by("charizard").id)]);
    const pool = deckPool("name");
    expect(pool).toContain(gourgeist);
    expect(pool).not.toContain(large);
    expect(pool).not.toContain(by("pikachustarter"));
    const gmaxToxtricity = pool.map(asPokemon).filter((each) => each.speciesName === "Toxtricity" && each.flags.includes("gmax"));
    expect(gmaxToxtricity.map((each) => each.name)).toEqual([
      "toxtricitygmax",
    ]);
    expect(pool).toContain(by("electrodehisui"));
  });

  it("answers with every category the Pokémon counts for", () => {
    expect(deck("region").answers(by("basculinwhitestriped"))).toEqual(["region-unova", "region-hisui"]);
    expect(deck("special").answers(by("koraidon"))).toEqual(["flag-legendary", "flag-paradox"]);
    expect(deck("special").eligible(by("pikachu"))).toBe(false); // regular Pokémon aren't asked
    expect(deck("type").answers(by("charizardmegax"))).toEqual(["type-fire", "type-dragon"]);
    expect(deck("stage").answers(by("charizard"))).toEqual(["stage-final"]);
  });

  it("asks weaknesses and names without crediting the type categories", () => {
    const charizard = by("charizard");
    expect(deck("matchup").answers(charizard)).toEqual(["type-water", "type-electric", "type-rock"]);
    expect(deck("name").answers(charizard)).toEqual([String(charizard.id)]);
    expect(deckCategories("matchup", charizard)).toEqual([]);
    expect(deckCategories("name", charizard)).toEqual([]);
    expect(deckCategories("type", charizard)).toEqual(["type-fire", "type-flying"]);
    expect(deckCategories("combo:type+region", charizard)).toEqual(["type-fire", "type-flying", "region-kanto"]);
  });

  it("grades single picks by membership and multi picks by exact set", () => {
    const special = deck("special");
    const koraidon = by("koraidon");
    // a Pokémon in two groups accepts either group alone
    expect(isRightPick(special, ["flag-paradox"], special.answers(koraidon))).toBe(true);
    expect(isRightPick(special, ["flag-fossil"], special.answers(koraidon))).toBe(false);
    expect(isRightPick(special, [], special.answers(koraidon))).toBe(false);
    // a dual-region form needs both regions
    const region = deck("region");
    const basculin = by("basculinwhitestriped");
    expect(isRightPick(region, ["region-unova"], region.answers(basculin))).toBe(false);
    expect(isRightPick(region, ["region-hisui", "region-unova"], region.answers(basculin))).toBe(true);
    const type = deck("type");
    const charizard = by("charizard");
    expect(isRightPick(type, ["type-fire"], type.answers(charizard))).toBe(false); // missing Flying
    expect(isRightPick(type, ["type-flying", "type-fire"], type.answers(charizard))).toBe(true);
    expect(isRightPick(type, ["type-fire", "type-flying", "type-water"], type.answers(charizard))).toBe(false);
  });

  it("combo decks intersect eligibility and union answers", () => {
    expect(deckParts("region")).toBe(null);
    expect(deckParts("combo:type+special")?.map((sub) => sub.id)).toEqual(["type", "special"]);
    // in no group, so no group combo, but type+region is fine
    expect(deckEligible("combo:type+special", by("pikachu"))).toBe(false);
    expect(deckEligible("combo:type+region", by("pikachu"))).toBe(true);
    expect(deckAnswers("combo:type+special", by("koraidon"))).toEqual([
      "type-fighting",
      "type-dragon",
      "flag-legendary",
      "flag-paradox",
    ]);
  });

  it("only asks about forms whose answer differs from the base species", () => {
    const region = deckPool("region");
    expect(region).toContain(by("basculinwhitestriped")); // Unova and Hisui, unlike Basculin
    expect(region).not.toContain(by("charizardmegax")); // same region as Charizard
    // regional forms answer themselves by name
    expect(region).not.toContain(by("growlithehisui"));
    const special = deckPool("special");
    expect(special).not.toContain(by("typhlosionhisui")); // starter, same as Typhlosion
    expect(special).toContain(by("koraidon"));
    expect(special).not.toContain(by("charizardgmax")); // Mega/Gmax never asked
    const type = deckPool("type");
    expect(type).toContain(by("charizardmegax")); // Fire/Dragon, unlike Charizard
    expect(type).not.toContain(by("charizardmegay")); // same types
    // a combo pool needs both parts eligible
    expect(deckPool("combo:type+special")).not.toContain(by("pikachu"));
    expect(deckPool("combo:type+special")).toContain(by("koraidon"));
  });

  it("asks every nature on two single-pick pads, the raised stat and the lowered one", () => {
    const parts = deckParts("nature");
    expect(parts?.map((part) => part.label)).toEqual(["Raised", "Lowered"]);
    expect(deckLabel("nature")).toBe("Natures");
    expect(isDeckId("nature")).toBe(true);
    expect(deckPool("nature")).toEqual(NATURES);
    const adamant = NATURE_BY_ID.get("adamant") as Subject;
    const hardy = NATURE_BY_ID.get("hardy") as Subject;
    expect(deckAnswers("nature", adamant)).toEqual(["nature-up-attack", "nature-down-spAttack"]);
    expect(deckAnswers("nature", hardy)).toEqual(["nature-up-none", "nature-down-none"]);
    expect(deckCategories("nature", adamant)).toEqual([]);
    expect(deckEligible("nature", adamant)).toBe(true);
    expect(deckEligible("nature", by("pikachu"))).toBe(false);
    expect(deckEligible("region", adamant)).toBe(false);
    expect(cardKey("nature", adamant)).toBe("nature:adamant");
    expect(subjectOf({ deckId: "nature", subjectId: "adamant" })).toBe(adamant);
    expect(subjectOf({ deckId: "region", subjectId: 25 })).toBe(by("pikachu"));
    // the two pads' picks sit in one list, graded each against its own options
    const [raised, lowered] = parts as [Deck, Deck];
    const picks = ["nature-down-spAttack", "nature-up-attack"];
    expect(isRightPick(raised, deckPicks(raised, picks), partAnswers(raised, adamant))).toBe(true);
    expect(isRightPick(lowered, deckPicks(lowered, picks), partAnswers(lowered, adamant))).toBe(true);
    expect(isRightPick(lowered, deckPicks(lowered, ["nature-up-attack", "nature-down-speed"]), partAnswers(lowered, adamant))).toBe(false);
    expect(raised.options.map((option) => option.short)).toEqual(["Attack", "Defense", "Sp. Atk", "Sp. Def", "Speed", "None"]);
  });

  it("mixes Natures into All only while no focus filter is set", () => {
    expect(dealtDeckIds("all", {})).toEqual(["region", "type", "special", "stage", "matchup", "name", "nature"]);
    expect(dealtDeckIds("all", { type: ["type-fire"] })).toEqual(["region", "type", "special", "stage", "matchup", "name"]);
    expect(dealtDeckIds("nature", { type: ["type-fire"] })).toEqual(["nature"]);
    // the filter is about Pokémon: a nature is never filtered out of its own deck
    expect(focusedDeckPool("nature", { type: ["type-fire"] })).toEqual(NATURES);
    expect(matchesFocus(NATURE_BY_ID.get("bold") as Subject, { type: ["type-fire"] })).toBe(true);
  });

  it("focus filters match OR within a facet and AND across facets", () => {
    expect(matchesFocus(by("pikachu"), {})).toBe(true);
    expect(matchesFocus(by("pikachu"), { region: ["region-kanto", "region-unova"] })).toBe(true);
    expect(matchesFocus(by("pikachu"), { region: ["region-unova"] })).toBe(false);
    expect(matchesFocus(by("charizard"), { region: ["region-kanto"], type: ["type-fire"] })).toBe(true);
    expect(matchesFocus(by("charizard"), { region: ["region-kanto"], type: ["type-water"] })).toBe(false);
    const legendaryStages = focusedDeckPool("stage", { special: ["flag-legendary"] });
    expect(legendaryStages.length).toBeGreaterThan(0);
    expect(legendaryStages.every((subject) => asPokemon(subject).flags.includes("legendary"))).toBe(true);
    // the chips: 4 stages (no Not Fully Evolved), 7 groups (no Mega/Gmax)
    expect(facetCategories("stage").map((category) => category.id)).toEqual([
      "stage-first",
      "stage-middle",
      "stage-final",
      "stage-single",
    ]);
    expect(facetCategories("special").map((category) => category.id)).not.toContain("flag-mega");
    expect(facetCategories("evo")).toHaveLength(5);
  });

  it("keeps the region deck's stats keys backwards compatible", () => {
    expect(cardKey("region", by("pikachu"))).toBe("25");
    expect(cardKey("special", by("koraidon"))).toBe(`special:${by("koraidon").id}`);
    expect(cardKey("combo:type+region", by("pikachu"))).toBe("combo:type+region:25");
    const keys = allCardKeys();
    expect(new Set(keys).size).toBe(keys.length);
    const deckIds = [...DECKS.map((each) => each.id), ...COMBO_IDS];
    expect(keys.length).toBe(deckIds.reduce((total, id) => total + deckPool(id).length, 0));
  });

  it("picks from the requested deck, or any single deck for All", () => {
    const merged = mergeBlocks([]);
    for (let i = 0; i < 20; i++) {
      expect(pickFlashcard(merged, { deckId: "special", random: () => i / 20 }).deckId).toBe("special");
    }
    for (let i = 0; i < 20; i++) {
      const pick = pickFlashcard(merged, { deckId: "combo:type+region", random: () => i / 20 });
      expect(pick.deckId).toBe("combo:type+region");
      expect(deckEligible("combo:type+region", pick.subject)).toBe(true);
    }
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      seen.add(pickFlashcard(merged, { deckId: "all", random: () => i / 40 }).deckId);
    }
    expect(seen.size).toBeGreaterThan(1);
    expect([...seen].every((id) => DECK_BY_ID.has(id))).toBe(true); // All never deals combos
    // the focus filter narrows what gets dealt
    for (let i = 0; i < 20; i++) {
      const pick = pickFlashcard(merged, {
        deckId: "region",
        filter: { region: ["region-hisui"] },
        random: () => i / 20,
      });
      expect(asPokemon(pick.subject).regions).toContain("hisui");
    }
    // the Natures deck deals natures, and All leaves them out under a filter
    for (let i = 0; i < 20; i++) {
      const pick = pickFlashcard(merged, { deckId: "nature", random: () => i / 20 });
      expect(pick.deckId).toBe("nature");
      expect(isNature(pick.subject)).toBe(true);
    }
    for (let i = 0; i < 40; i++) {
      const pick = pickFlashcard(merged, { deckId: "all", filter: { type: ["type-fire"] }, random: () => i / 40 });
      expect(pick.deckId).not.toBe("nature");
    }
  });
});

describe("dueCardCount", () => {
  it("counts due cards over every deck, or only what a deck and filter can deal", () => {
    const now = 1_700_000_000_000;
    const anHourAgo = { a: 1, c: 1, s: 0, t: now - 3_600_000 }; // a 10-minute interval, long past
    const growlithe = by("growlithe"); // Kanto, Fire, first stage
    const block = emptyBlock("test");
    block.flashcards[cardKey("region", growlithe)] = anHourAgo;
    block.flashcards[cardKey("type", growlithe)] = anHourAgo;
    block.flashcards[cardKey("combo:type+region", growlithe)] = anHourAgo;
    block.flashcards[cardKey("nature", NATURE_BY_ID.get("jolly") as Subject)] = anHourAgo;
    const merged = mergeBlocks([block]);
    expect(dueCardCount(merged, now)).toBe(4);
    expect(dueCardCount(merged, now, { deckId: "all", filter: {} })).toBe(3); // All never deals combos
    expect(dueCardCount(merged, now, { deckId: "all", filter: { type: ["type-fire"] } })).toBe(2); // nor natures under a filter
    expect(dueCardCount(merged, now, { deckId: "nature", filter: {} })).toBe(1);
    expect(dueCardCount(merged, now, { deckId: "region", filter: {} })).toBe(1);
    expect(dueCardCount(merged, now, { deckId: "region", filter: { type: ["type-fire"] } })).toBe(1);
    expect(dueCardCount(merged, now, { deckId: "region", filter: { type: ["type-water"] } })).toBe(0);
    expect(dueCardCount(merged, now, { deckId: "combo:type+region", filter: {} })).toBe(1);
    expect(dueCardCount(merged, now, { deckId: "stage", filter: {} })).toBe(0);
  });
});

describe("deckPicks", () => {
  it("splits a combo card's one pick list by each pad's options", () => {
    const picks = ["region-kanto", "type-fire", "type-flying"];
    expect(deckPicks(deck("type"), picks)).toEqual(["type-fire", "type-flying"]);
    expect(deckPicks(deck("region"), picks)).toEqual(["region-kanto"]);
    expect(deckPicks(deck("stage"), picks)).toEqual([]);
  });
});
