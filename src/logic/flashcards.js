// Flashcard decks — one per group of categories in Stats, except Type
// Count (answering the Type deck with both types already says mono or
// dual). Each shows a Pokémon and asks one question with a fixed set of
// answer buttons. A card
// can have several correct answers (a dual type, a form counting for two
// regions, Koraidon being Paradox and Legendary); any of them is accepted.
// Some decks ask about a specific thing per card (`param`): the Moves deck
// picks one move and asks yes/no.

import { CATEGORIES } from "../data/categories.js";
import { POKEMON, POKEMON_BY_ID } from "../data/pokedex.js";
import { MOVES } from "../data/traits.js";

const cat = (id) => CATEGORIES.find((c) => c.id === id);
const isMegaOrGmax = (p) => p.flags.includes("mega") || p.flags.includes("gmax");
const base = (p) => POKEMON_BY_ID.get(p.species);
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const YES_NO = [
  { id: "yes", short: "Yes" },
  { id: "no", short: "No" },
];

const SPECIAL_FLAGS = ["legendary", "mythical", "ultraBeast", "paradox", "fossil", "starter", "baby"];

// A deck: { id, label, question(param), options, answers(p, param),
//   eligible(p), bias(p), pickParam?(p, random), categories(p, param),
//   multi?, implies? (option id -> ids that come with it) }
// `categories` are the category ids the attempt is recorded against (the
// answers, unless the answer is yes/no).
const withDefaults = (deck) => ({
  question: () => deck.questionText,
  categories: (p, param) => deck.answers(p, param).filter((id) => id !== "none"),
  bias: () => 1,
  ...deck,
});

export const DECKS = [
  {
    id: "region",
    label: "Region",
    multi: true, // pick every region it counts for, then Check
    questionText: "Which region is this Pokémon from?",
    options: CATEGORIES.filter((c) => c.group === "region"),
    answers: (p) => p.regions.map((r) => `region-${r}`),
    eligible: (p) => p.regions.length > 0 && !isMegaOrGmax(p),
    // Gen 5+ regions are the user's known weak spot
    bias: (p) => (p.gen >= 5 ? 2 : 1),
  },
  {
    id: "type",
    label: "Type",
    multi: true, // both types of a dual type, then Check
    questionText: "What type is this Pokémon?",
    options: CATEGORIES.filter((c) => c.group === "type"),
    answers: (p) => p.types.map((t) => `type-${t}`),
    // Megas can change type (Mega Charizard X); Gmax never does
    eligible: (p) => !p.flags.includes("gmax"),
  },
  {
    id: "method",
    label: "Evolution Method",
    multi: true, // every method it counts for, then Check
    // Always-true pairs are ticked for you: a stone is an item, and
    // friendship evolutions also count as level-up
    implies: { "evo-stone": ["evo-item"], "evo-friendship": ["evo-level"] },
    questionText: "How did this Pokémon evolve?",
    options: ["evo-level", "evo-item", "evo-stone", "evo-trade", "evo-friendship"].map((id) => ({
      ...cat(id),
      short: cat(id).short.replace(" Evo", "").replace("Level", "Level-Up"),
    })),
    answers: (p) => p.evoMethods.map((m) => `evo-${m}`),
    eligible: (p) =>
      (p.stage === "middle" || p.stage === "final") && p.evoMethods.length > 0 && !isMegaOrGmax(p),
    bias: (p) => (p.evoMethods.includes("level") && p.evoMethods.length === 1 ? 1 : 2),
  },
  {
    id: "stage",
    label: "Evolution Stage",
    questionText: "Where is it in its evolution line?",
    options: ["stage-first", "stage-middle", "stage-final", "stage-single"].map(cat),
    answers: (p) => [`stage-${p.stage}`],
    eligible: (p) => p.stage !== null && !isMegaOrGmax(p),
  },
  {
    id: "branched",
    label: "Evolution Line",
    questionText: "Does it have a branched evolution?",
    options: YES_NO,
    answers: (p) => [p.branched ? "yes" : "no"],
    categories: () => ["branched"],
    // Only Pokémon that evolve at all make a fair question; lean to the
    // branched ones since there are so few
    eligible: (p) => (p.stage === "first" || p.stage === "middle") && !isMegaOrGmax(p),
    bias: (p) => (p.branched ? 8 : 1),
  },
  {
    id: "special",
    label: "Group",
    questionText: "Which group is this Pokémon in?",
    options: SPECIAL_FLAGS.map((f) => cat(`flag-${f}`)),
    answers: (p) => SPECIAL_FLAGS.filter((f) => p.flags.includes(f)).map((f) => `flag-${f}`),
    // Only Pokémon that are in a group: the ~900 regular ones would swamp
    // the deck and teach nothing
    eligible: (p) => !isMegaOrGmax(p) && p.flags.some((f) => SPECIAL_FLAGS.includes(f)),
  },
  {
    id: "move",
    label: "Move",
    question: (moveId) => `Can this Pokémon learn ${MOVES.find((m) => m.id === moveId).name}?`,
    options: YES_NO,
    // Half the time ask about a move it does learn, half about one it doesn't
    pickParam: (p, random) => {
      const yes = MOVES.filter((m) => p.moves.includes(m.id)).map((m) => m.id);
      const no = MOVES.filter((m) => !p.moves.includes(m.id)).map((m) => m.id);
      const pool = yes.length && (random() < 0.5 || !no.length) ? yes : no;
      return pool[Math.floor(random() * pool.length)];
    },
    answers: (p, moveId) => [p.moves.includes(moveId) ? "yes" : "no"],
    categories: (_pokemon, moveId) => [`move-${moveId}`],
    eligible: (p) => !p.flags.includes("gmax"),
  },
  {
    id: "ability",
    label: "Ability",
    questionText: "Which of these abilities can it have?",
    options: [
      ...CATEGORIES.filter((c) => c.group === "ability"),
      { id: "none", label: "None of These", short: "None of These" },
    ],
    answers: (p) => (p.abilities.length ? p.abilities.map((a) => `ability-${a}`) : ["none"]),
    eligible: (p) => !p.flags.includes("gmax"),
    bias: (p) => (p.abilities.length ? 3 : 1),
  },
].map(withDefaults);

export const DECK_BY_ID = new Map(DECKS.map((d) => [d.id, d]));

// A form is only worth its own card when the deck's answer differs from
// the base species' (Hisuian Growlithe: yes; Mega Charizard Y: no). The
// Moves deck compares the whole move list.
const distinctFromBase = (p, deck) => {
  if (p.form === null) return true;
  const b = base(p);
  if (deck.id === "move") return !sameList(p.moves, b.moves);
  return !sameList(deck.answers(p), deck.answers(b));
};

// The Pokémon a deck can ask about, computed once.
const poolCache = new Map();
export function deckPool(deck) {
  if (!poolCache.has(deck.id)) {
    poolCache.set(
      deck.id,
      POKEMON.filter((p) => deck.eligible(p) && distinctFromBase(p, deck))
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
  card: null, // { deckId, pokemonId, param }
  next: null, // the card after this one, picked early so its sprite can preload
  picked: null, // option id (or array of ids for multi decks), "gaveup", or null while unanswered
  selection: [], // multi decks: options toggled on so far
  recent: [], // last few pokemon ids, to avoid immediate repeats
};
