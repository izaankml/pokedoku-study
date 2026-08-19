// Flashcard decks — one per group of categories in Stats, except Type
// Count (answering the Type deck with both types already says mono or
// dual). Each shows a Pokémon and asks one question with a fixed set of
// answer buttons. A card
// can have several correct answers (a dual type, a form counting for two
// regions, Koraidon being Paradox and Legendary); any of them is accepted.
// Some decks ask about a specific thing per card (`param`): the Moves deck
// picks one move and asks yes/no.

import { CATEGORIES, getCategory } from "../data/categories.ts";
import { POKEMON, POKEMON_BY_ID } from "../data/pokedex.ts";
import { MOVES } from "../data/traits.ts";
import type { Flag, Pokemon } from "../data/types.ts";
import { loadJson, saveJson } from "./hashState.ts";
import type { RandomSource } from "./picker.ts";

// An answer button: a category, or a stand-in ("yes", "no", "none").
export interface DeckOption {
  id: string;
  label: string;
  short: string;
}

export interface Deck {
  id: string;
  label: string;
  // several options must be picked, not any one
  multi?: boolean;
  // option id -> ids that come with it (a stone is an item)
  implies?: Record<string, string[]>;
  // the question for a card (`param` is what the card asks about, if anything)
  question: (param?: string | null) => string;
  options: DeckOption[];
  // the option ids that are right for this Pokémon
  answers: (pokemon: Pokemon, param?: string | null) => string[];
  // whether the deck can ask about this Pokémon at all
  eligible: (pokemon: Pokemon) => boolean;
  // how much more often than normal to ask about this Pokémon
  bias: (pokemon: Pokemon) => number;
  // picks what the card asks about (the Moves deck: a move id)
  pickParam?: (pokemon: Pokemon, random: RandomSource) => string;
  // the category ids the attempt is recorded against (the answers, unless
  // the answer is yes/no)
  categories: (pokemon: Pokemon, param?: string | null) => string[];
}

// What a deck definition spells out; the rest takes defaults.
type DeckDefinition = Omit<Deck, "question" | "categories" | "bias"> &
  Partial<Pick<Deck, "question" | "categories" | "bias">> & {
    // the question, when it is the same on every card
    questionText?: string;
  };

const isMegaOrGmax = (pokemon: Pokemon): boolean =>
  pokemon.flags.includes("mega") || pokemon.flags.includes("gmax");
const baseOf = (pokemon: Pokemon): Pokemon => POKEMON_BY_ID.get(pokemon.species) ?? pokemon;
const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((item, index) => item === b[index]);
const YES_NO: DeckOption[] = [
  { id: "yes", label: "Yes", short: "Yes" },
  { id: "no", label: "No", short: "No" },
];

const SPECIAL_FLAGS: Flag[] = ["legendary", "mythical", "ultraBeast", "paradox", "fossil", "starter", "baby"];

const withDefaults = ({ questionText, ...deck }: DeckDefinition): Deck => ({
  question: () => questionText ?? "",
  categories: (pokemon, param) => deck.answers(pokemon, param).filter((id) => id !== "none"),
  bias: () => 1,
  ...deck,
});

const moveName = (moveId?: string | null): string => MOVES.find((move) => move.id === moveId)?.name ?? "";

export const DECKS: Deck[] = (
  [
    {
      id: "region",
      label: "Region",
      multi: true, // pick every region it counts for, then Submit
      questionText: "Which region is this Pokémon from?",
      options: CATEGORIES.filter((category) => category.group === "region"),
      answers: (pokemon) => pokemon.regions.map((region) => `region-${region}`),
      eligible: (pokemon) => pokemon.regions.length > 0 && !isMegaOrGmax(pokemon),
      // Gen 5+ regions are the user's known weak spot
      bias: (pokemon) => (pokemon.gen >= 5 ? 2 : 1),
    },
    {
      id: "type",
      label: "Type",
      multi: true, // both types of a dual type, then Submit
      questionText: "What type is this Pokémon?",
      options: CATEGORIES.filter((category) => category.group === "type"),
      answers: (pokemon) => pokemon.types.map((type) => `type-${type}`),
      // Megas can change type (Charizard Mega X); Gmax never does
      eligible: (pokemon) => !pokemon.flags.includes("gmax"),
    },
    {
      id: "method",
      label: "Evolution Method",
      multi: true, // every method it counts for, then Submit
      // Always-true pairs are ticked for you: a stone is an item, and
      // friendship evolutions also count as level-up
      implies: { "evo-stone": ["evo-item"], "evo-friendship": ["evo-level"] },
      questionText: "How did this Pokémon evolve?",
      options: ["evo-level", "evo-item", "evo-stone", "evo-trade", "evo-friendship"].map((id) => ({
        ...getCategory(id),
        short: getCategory(id).short.replace(" Evolution", "").replace("Level", "Level-Up"),
      })),
      answers: (pokemon) => pokemon.evoMethods.map((method) => `evo-${method}`),
      eligible: (pokemon) =>
        (pokemon.stage === "middle" || pokemon.stage === "final") &&
        pokemon.evoMethods.length > 0 &&
        !isMegaOrGmax(pokemon),
      bias: (pokemon) => (pokemon.evoMethods.includes("level") && pokemon.evoMethods.length === 1 ? 1 : 2),
    },
    {
      id: "stage",
      label: "Evolution Stage",
      questionText: "Where is it in its evolution line?",
      options: ["stage-first", "stage-middle", "stage-final", "stage-single"].map(getCategory),
      answers: (pokemon) => [`stage-${pokemon.stage}`],
      eligible: (pokemon) => pokemon.stage !== null && !isMegaOrGmax(pokemon),
    },
    {
      id: "branched",
      label: "Evolution Line",
      questionText: "Does it have a branched evolution?",
      options: YES_NO,
      answers: (pokemon) => [pokemon.branched ? "yes" : "no"],
      categories: () => ["branched"],
      // Only Pokémon that evolve at all make a fair question; lean to the
      // branched ones since there are so few
      eligible: (pokemon) => (pokemon.stage === "first" || pokemon.stage === "middle") && !isMegaOrGmax(pokemon),
      bias: (pokemon) => (pokemon.branched ? 8 : 1),
    },
    {
      id: "special",
      label: "Group",
      questionText: "Which group is this Pokémon in?",
      options: SPECIAL_FLAGS.map((flag) => getCategory(`flag-${flag}`)),
      answers: (pokemon) => SPECIAL_FLAGS.filter((flag) => pokemon.flags.includes(flag)).map((flag) => `flag-${flag}`),
      // Only Pokémon that are in a group: the ~900 regular ones would swamp
      // the deck and teach nothing
      eligible: (pokemon) => !isMegaOrGmax(pokemon) && pokemon.flags.some((flag) => SPECIAL_FLAGS.includes(flag)),
    },
    {
      id: "move",
      label: "Move",
      question: (moveId) => `Can this Pokémon learn ${moveName(moveId)}?`,
      options: YES_NO,
      // Half the time ask about a move it does learn, half about one it doesn't
      pickParam: (pokemon, random) => {
        const learns = MOVES.filter((move) => pokemon.moves.includes(move.id)).map((move) => move.id);
        const lacks = MOVES.filter((move) => !pokemon.moves.includes(move.id)).map((move) => move.id);
        const pool = learns.length && (random() < 0.5 || !lacks.length) ? learns : lacks;
        return pool[Math.floor(random() * pool.length)];
      },
      answers: (pokemon, moveId) => [moveId != null && pokemon.moves.includes(moveId) ? "yes" : "no"],
      categories: (_pokemon, moveId) => [`move-${moveId}`],
      eligible: (pokemon) => !pokemon.flags.includes("gmax"),
    },
    {
      id: "ability",
      label: "Ability",
      questionText: "Which of these abilities can it have?",
      options: [
        ...CATEGORIES.filter((category) => category.group === "ability"),
        { id: "none", label: "None of These", short: "None of These" },
      ],
      answers: (pokemon) =>
        pokemon.abilities.length ? pokemon.abilities.map((ability) => `ability-${ability}`) : ["none"],
      eligible: (pokemon) => !pokemon.flags.includes("gmax"),
      bias: (pokemon) => (pokemon.abilities.length ? 3 : 1),
    },
  ] satisfies DeckDefinition[]
).map(withDefaults);

export const DECK_BY_ID = new Map<string, Deck>(DECKS.map((deck) => [deck.id, deck]));

// A form is only worth its own card when the deck's answer differs from
// the base species' (Growlithe Hisui: yes; Charizard Mega Y: no). The
// Moves deck compares the whole move list.
const distinctFromBase = (pokemon: Pokemon, deck: Deck): boolean => {
  if (pokemon.form === null) return true;
  const base = baseOf(pokemon);
  if (deck.id === "move") return !sameList(pokemon.moves, base.moves);
  return !sameList(deck.answers(pokemon), deck.answers(base));
};

// The Pokémon a deck can ask about, computed once.
const poolCache = new Map<string, Pokemon[]>();
export function deckPool(deck: Deck): Pokemon[] {
  let pool = poolCache.get(deck.id);
  if (!pool) {
    pool = POKEMON.filter((pokemon) => deck.eligible(pokemon) && distinctFromBase(pokemon, deck));
    poolCache.set(deck.id, pool);
  }
  return pool;
}

// Stats key for a card. The region deck keeps the bare species id so
// history recorded before decks existed still counts.
export const cardKey = (deck: Deck, pokemon: Pokemon): string =>
  deck.id === "region" ? String(pokemon.id) : `${deck.id}:${pokemon.id}`;

export function allCardKeys(): string[] {
  return DECKS.flatMap((deck) => deckPool(deck).map((pokemon) => cardKey(deck, pokemon)));
}

// A card on the table: which deck, which Pokémon, and what it asks about.
export interface Card {
  deckId: string;
  pokemonId: number;
  param: string | null;
}

// What was submitted: the option ids, "gaveup", or null while unanswered.
export type Picked = string[] | "gaveup" | null;

export interface CardSession {
  // the deck in play, or "all"
  deckId: string;
  card: Card | null;
  // the card after this one, picked early so its sprite can preload
  next: Card | null;
  picked: Picked;
  // options toggled on so far, before Submit
  selection: string[];
  // last few pokemon ids, to avoid immediate repeats
  recent: number[];
}

// What saveSession writes: everything but `next`, which is cheap to re-pick.
type StoredSession = Omit<CardSession, "next">;

function isStoredSession(value: unknown): value is StoredSession {
  if (typeof value !== "object" || value === null) return false;
  const stored = value as Partial<StoredSession>;
  return (
    typeof stored.deckId === "string" &&
    typeof stored.card === "object" &&
    stored.card !== null &&
    DECK_BY_ID.has(stored.card.deckId) &&
    Array.isArray(stored.selection) &&
    Array.isArray(stored.recent)
  );
}

// The current card survives tab switches and reloads: the Cards tab reads
// its initial state from here, writes every change back, and saveSession
// mirrors it to localStorage.
const SESSION_KEY = "pokedoku-study:cards:v1";
const stored = loadJson(SESSION_KEY);
export const session: CardSession = {
  deckId: "all",
  card: null,
  next: null,
  picked: null,
  selection: [],
  recent: [],
  ...(isStoredSession(stored) ? stored : {}),
};

export function saveSession(): void {
  const { deckId, card, picked, selection, recent } = session;
  saveJson(SESSION_KEY, { deckId, card, picked, selection, recent } satisfies StoredSession);
}
