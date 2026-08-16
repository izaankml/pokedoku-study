// Flashcard decks: each shows a Pokémon and asks one question with a fixed
// set of answer buttons. A card can have several correct answers (a form
// counting for two regions, Koraidon being Paradox and Legendary); any of
// them is accepted.

import { CATEGORIES } from "../data/categories.js";
import { POKEMON, POKEMON_BY_ID } from "../data/pokedex.js";

const cat = (id) => CATEGORIES.find((c) => c.id === id);
const isMegaOrGmax = (p) => p.flags.includes("mega") || p.flags.includes("gmax");
const base = (p) => POKEMON_BY_ID.get(p.species);
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// A form is only worth its own card when the deck's answer differs from
// the base species' (Hisuian Growlithe: yes; Mega Charizard Y: no).
const distinctFromBase = (p, answersOf) =>
  p.form === null || !sameList(answersOf(p), answersOf(base(p)));

const SPECIAL_FLAGS = ["legendary", "mythical", "ultraBeast", "paradox", "fossil", "starter", "baby"];

export const DECKS = [
  {
    id: "region",
    label: "Region",
    question: "Which region is this Pokémon originally from?",
    options: CATEGORIES.filter((c) => c.group === "region"),
    answers: (p) => p.regions.map((r) => `region-${r}`),
    eligible: (p) => p.regions.length > 0 && !isMegaOrGmax(p),
    // Gen 5+ regions are the user's known weak spot
    bias: (p) => (p.gen >= 5 ? 2 : 1),
  },
  {
    id: "special",
    label: "Special",
    question: "Which special group is this Pokémon in?",
    options: [
      ...SPECIAL_FLAGS.map((f) => cat(`flag-${f}`)),
      { id: "none", label: "None of these", short: "None of these" },
    ],
    answers: (p) => {
      const hits = SPECIAL_FLAGS.filter((f) => p.flags.includes(f)).map((f) => `flag-${f}`);
      return hits.length ? hits : ["none"];
    },
    eligible: (p) => !isMegaOrGmax(p),
    // Most Pokémon are "none"; lean towards the ones that aren't
    bias: (p) => (p.flags.some((f) => SPECIAL_FLAGS.includes(f)) ? 3 : 1),
  },
  {
    id: "stage",
    label: "Stage",
    question: "Where does this Pokémon sit in its evolution line?",
    options: ["stage-first", "stage-middle", "stage-final", "stage-single"].map(cat),
    answers: (p) => [`stage-${p.stage}`],
    eligible: (p) => p.stage !== null && !isMegaOrGmax(p),
    bias: () => 1,
  },
  {
    id: "method",
    label: "Method",
    question: "How did this Pokémon evolve from its pre-evolution?",
    options: ["evo-level", "evo-item", "evo-stone", "evo-trade", "evo-friendship"].map((id) => ({
      ...cat(id),
      short: cat(id).short.replace(" evo", "").replace("Level", "Level-Up"),
    })),
    answers: (p) => p.evoMethods.map((m) => `evo-${m}`),
    eligible: (p) =>
      (p.stage === "middle" || p.stage === "final") && p.evoMethods.length > 0 && !isMegaOrGmax(p),
    bias: (p) => (p.evoMethods.includes("level") && p.evoMethods.length === 1 ? 1 : 2),
  },
];

export const DECK_BY_ID = new Map(DECKS.map((d) => [d.id, d]));

// The Pokémon a deck can ask about, computed once.
const poolCache = new Map();
export function deckPool(deck) {
  if (!poolCache.has(deck.id)) {
    poolCache.set(
      deck.id,
      POKEMON.filter((p) => deck.eligible(p) && distinctFromBase(p, deck.answers))
    );
  }
  return poolCache.get(deck.id);
}

// Stats key for a card. The region deck keeps the bare species id so
// history recorded before decks existed still counts.
export const cardKey = (deck, pokemon) =>
  deck.id === "region" ? String(pokemon.id) : `${deck.id}:${pokemon.id}`;

export function allCardKeys() {
  return DECKS.flatMap((deck) => deckPool(deck).map((p) => cardKey(deck, p)));
}

// The current card survives tab switches: the Cards tab reads its initial
// state from here and writes every change back.
export const session = {
  deckId: "all",
  card: null, // { deckId, pokemonId }
  picked: null, // option id chosen, "gaveup", or null while unanswered
  recent: [], // last few pokemon ids, to avoid immediate repeats
};
