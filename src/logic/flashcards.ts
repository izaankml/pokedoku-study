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
import { weaknessesOf } from "../data/typechart.ts";
import { FLAGS } from "../data/types.ts";
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
  // the answer is typed, not picked from options ("name": the Pokémon's
  // own name via the autocomplete)
  input?: "name";
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
  // picks what the card asks about (the Moves deck: a move id); `allowed`
  // is the deck's active filter, when one is set
  pickParam?: (pokemon: Pokemon, random: RandomSource, allowed?: Set<string> | null) => string;
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
// A regional form is named for its region ("Growlithe Hisui", "Tauros
// Paldea Combat Breed"), so a region question about it answers itself
const REGIONAL_FORM = /^(Alola|Galar|Hisui|Paldea)(-|$)/;
const isRegionalForm = (pokemon: Pokemon): boolean => pokemon.form !== null && REGIONAL_FORM.test(pokemon.form);
const baseOf = (pokemon: Pokemon): Pokemon => POKEMON_BY_ID.get(pokemon.species) ?? pokemon;
const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((item, index) => item === b[index]);
const YES_NO: DeckOption[] = [
  { id: "yes", label: "Yes", short: "Yes" },
  { id: "no", label: "No", short: "No" },
];

// every flag except the two form kinds, straight from the canonical list
const SPECIAL_FLAGS: Flag[] = FLAGS.filter((flag) => flag !== "mega" && flag !== "gmax");
// the 18 type categories, shared by the Type and Matchup decks
const TYPE_OPTIONS = CATEGORIES.filter((category) => category.group === "type");

const pickOne = <T,>(items: T[], random: RandomSource): T => items[Math.floor(random() * items.length)];

const withDefaults = ({ questionText, ...deck }: DeckDefinition): Deck => ({
  question: () => questionText ?? "",
  categories: (pokemon, param) => deck.answers(pokemon, param).filter((id) => id !== "none"),
  bias: () => 1,
  ...deck,
});

// ---- the Combo deck: one card asking two or three groups at once ----

// Each combo is a param ("type+region"); its answers are the union of the
// sub-decks' and all of them must be picked. Method (its implies) and the
// yes/no decks stay out.
export const COMBOS = ["type+region", "type+special", "region+special", "type+special+ability"] as const;

// The sub-decks a combo param names ("type+region"); distinctFromBase
// calls answers() with no param, so default to the broadest combo. The
// lists are shared and built once (lazily — DECK_BY_ID doesn't exist
// while the deck definitions are still being constructed).
let comboDecksCache: Map<string, Deck[]> | null = null;
export function comboDecks(param?: string | null): Deck[] {
  if (!comboDecksCache) {
    comboDecksCache = new Map(
      COMBOS.map((combo) => [
        combo,
        combo.split("+").map((id) => {
          const deck = DECK_BY_ID.get(id);
          if (!deck) throw new Error(`unknown combo sub-deck: ${id}`);
          return deck;
        }),
      ]),
    );
  }
  // an unknown param (a stored card from before COMBOS changed) falls
  // back to the default combo rather than throwing mid-render; answers
  // and the rendered sections go through here alike, so they stay
  // consistent with each other
  return comboDecksCache.get(param && comboDecksCache.has(param) ? param : COMBOS[0]) as Deck[];
}

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
      // not the regional forms, whose names give the answer away; dual-region
      // forms (White-Striped Basculin, Bloodmoon Ursaluna) stay — theirs don't
      eligible: (pokemon) => pokemon.regions.length > 0 && !isMegaOrGmax(pokemon) && !isRegionalForm(pokemon),
      // Gen 5+ regions are the user's known weak spot
      bias: (pokemon) => (pokemon.gen >= 5 ? 2 : 1),
    },
    {
      id: "type",
      label: "Type",
      multi: true, // both types of a dual type, then Submit
      questionText: "What type is this Pokémon?",
      options: TYPE_OPTIONS,
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
      // The buttons carry their own terse labels, in this order; the
      // categories' shorts are the full "Evolved by X" (they label grid
      // headers and pills)
      options: (
        [
          ["evo-level", "Level-Up"],
          ["evo-item", "Item"],
          ["evo-stone", "Stone"],
          ["evo-trade", "Trade"],
          ["evo-friendship", "Friendship"],
        ] as const
      ).map(([id, short]) => ({ ...getCategory(id), short })),
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
      // Half the time ask about a move it does learn, half about one it
      // doesn't — drawn from the filtered moves, when a filter is set
      pickParam: (pokemon, random, allowed) => {
        const asked = MOVES.filter((move) => !allowed || allowed.has(`move-${move.id}`));
        const learns = asked.filter((move) => pokemon.moves.includes(move.id)).map((move) => move.id);
        const lacks = asked.filter((move) => !pokemon.moves.includes(move.id)).map((move) => move.id);
        const pool = learns.length && (random() < 0.5 || !lacks.length) ? learns : lacks;
        return pickOne(pool, random);
      },
      answers: (pokemon, moveId) => [moveId != null && pokemon.moves.includes(moveId) ? "yes" : "no"],
      categories: (_pokemon, moveId) => [`move-${moveId}`],
      eligible: (pokemon) => !pokemon.flags.includes("gmax"),
    },
    {
      id: "matchup",
      label: "Matchup",
      multi: true, // every type that hits it super-effectively, then Submit
      questionText: "Which types are super effective against it?",
      options: TYPE_OPTIONS,
      answers: (pokemon) => weaknessesOf(pokemon.types).map((type) => `type-${type}`),
      // pure type-chart knowledge — never bump the type categories'
      // identification accuracy with matchup answers
      categories: () => [],
      // every typing in Gen 6+ has a weakness, but guard anyway
      eligible: (pokemon) => weaknessesOf(pokemon.types).length > 0,
    },
    {
      id: "name",
      label: "Name",
      input: "name",
      questionText: "Name this Pokémon",
      options: [],
      // the record itself: form names must be exact, as on PokeDoku
      answers: (pokemon) => [String(pokemon.id)],
      categories: () => [],
      eligible: () => true,
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
    {
      id: "combo",
      label: "Combo",
      multi: true, // every answer of every asked group
      question: (param) => `Pick every answer: ${comboDecks(param).map((sub) => sub.label).join(" + ")}`,
      // filled in below from the sub-decks themselves, once DECK_BY_ID
      // exists — the answered view uses this union; the unanswered card
      // renders per-group sections
      options: [],
      answers: (pokemon, param) => comboDecks(param).flatMap((sub) => sub.answers(pokemon)),
      categories: (pokemon, param) => comboDecks(param).flatMap((sub) => sub.categories(pokemon)),
      // askable when some combo's every sub-deck would ask about it
      eligible: (pokemon) => COMBOS.some((combo) => comboDecks(combo).every((sub) => sub.eligible(pokemon))),
      pickParam: (pokemon, random) => {
        const valid = COMBOS.filter((combo) => comboDecks(combo).every((sub) => sub.eligible(pokemon)));
        return pickOne(valid, random);
      },
    },
  ] satisfies DeckDefinition[]
).map(withDefaults);

export const DECK_BY_ID = new Map<string, Deck>(DECKS.map((deck) => [deck.id, deck]));

// Combo offers exactly what its sub-decks offer, deduped — derived here
// because the deck literal above cannot reference DECK_BY_ID yet. A new
// combo in COMBOS automatically brings its options along.
{
  const comboDeck = DECK_BY_ID.get("combo");
  if (comboDeck) {
    const seen = new Set<string>();
    comboDeck.options = COMBOS.flatMap((combo) => comboDecks(combo))
      .flatMap((sub) => sub.options)
      .filter((option) => {
        if (seen.has(option.id)) return false;
        seen.add(option.id);
        return true;
      });
  }
}

// A form is only worth its own card when the deck's answer differs from
// the base species' (Growlithe Hisui: yes; Charizard Mega Y: no). The
// Moves deck compares the whole move list.
const distinctFromBase = (pokemon: Pokemon, deck: Deck): boolean => {
  if (pokemon.form === null) return true;
  const base = baseOf(pokemon);
  if (deck.id === "move") return !sameList(pokemon.moves, base.moves);
  // a combo card is worth asking if ANY of its combos would differ
  if (deck.id === "combo") {
    return COMBOS.some((combo) => !sameList(deck.answers(pokemon, combo), deck.answers(base, combo)));
  }
  return !sameList(deck.answers(pokemon), deck.answers(base));
};

// A deck's pool narrowed to a filter, cached per (deck, chosen set) —
// re-filtering ~1000 answers() calls on every card advance is the app's
// hottest path, and a user only ever has a handful of filter states.
const filteredPoolCache = new Map<string, Pokemon[]>();
export function filteredDeckPool(deck: Deck, chosen: Set<string> | null): Pokemon[] {
  if (!chosen) return deckPool(deck);
  const key = `${deck.id}|${[...chosen].sort().join(",")}`;
  let pool = filteredPoolCache.get(key);
  if (!pool) {
    pool = deckPool(deck).filter((pokemon) => passesFilter(deck, pokemon, chosen));
    filteredPoolCache.set(key, pool);
  }
  return pool;
}

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

// ---- per-deck filters: restrict what a deck may ask about ----

// deck id -> the option ids the user still wants asked ("region-unova",
// "evo-stone", …; the Move deck's are its "move-<id>" categories). A
// missing or empty list means no filter. Stats pools stay unfiltered —
// filtering changes what gets asked, not what counts.
export type DeckFilters = Record<string, string[]>;

export const FILTERABLE_DECKS = new Set(["region", "type", "method", "special", "move", "ability"]);

const FILTERS_KEY = "pokedoku-study:cards:filters:v1";

export function loadFilters(): DeckFilters {
  const saved = loadJson(FILTERS_KEY);
  if (typeof saved !== "object" || saved === null || Array.isArray(saved)) return {};
  const filters: DeckFilters = {};
  for (const [deckId, ids] of Object.entries(saved)) {
    if (FILTERABLE_DECKS.has(deckId) && Array.isArray(ids)) {
      filters[deckId] = ids.filter((id): id is string => typeof id === "string");
    }
  }
  return filters;
}

export function saveFilters(filters: DeckFilters): void {
  saveJson(FILTERS_KEY, filters);
}

// The subjects a deck can be filtered by — its real options (no yes/no,
// no "none"); the Move deck's are its move categories, whose ids are
// what passesFilter matches the asked move against. Static per deck, so
// computed once (filterFor calls this on hot paths).
const filterableCache = new Map<string, DeckOption[]>();
export function filterableOptions(deck: Deck): DeckOption[] {
  let options = filterableCache.get(deck.id);
  if (!options) {
    options =
      deck.id === "move"
        ? CATEGORIES.filter((category) => category.group === "move")
        : deck.options.filter((option) => option.id !== "none" && option.id !== "yes" && option.id !== "no");
    filterableCache.set(deck.id, options);
  }
  return options;
}

// The active subset for a deck, or null for "everything" (also when the
// stored list selects all or none of the options — both mean no filter).
export function filterFor(filters: DeckFilters, deckId: string): Set<string> | null {
  const deck = DECK_BY_ID.get(deckId);
  const ids = filters[deckId];
  if (!deck || !ids || !ids.length) return null;
  const chosen = new Set(ids);
  const options = filterableOptions(deck);
  const kept = options.filter((option) => chosen.has(option.id));
  return kept.length === 0 || kept.length === options.length ? null : new Set(kept.map((option) => option.id));
}

// Whether the deck may ask this card under `chosen`: some answer must be
// a chosen subject ("ask me about Stone evolutions" keeps every stone
// evolver, even though stone always implies item; "ask me about
// Levitate" skips the many whose only answer is None of These). Every
// option stays visible on the card, so the full answer is always
// givable. The Move deck is judged by the move it asks about: with no
// `param` yet (pool filtering) it always passes — the picker narrows
// the asked move instead.
export function passesFilter(deck: Deck, pokemon: Pokemon, chosen: Set<string> | null, param?: string | null): boolean {
  if (!chosen) return true;
  if (deck.id === "move") return param == null || chosen.has(`move-${param}`);
  return deck.answers(pokemon).some((id) => chosen.has(id));
}

// Stats key for a card. The region deck keeps the bare species id so
// history recorded before decks existed still counts.
export const cardKey = (deck: Deck, pokemon: Pokemon): string =>
  deck.id === "region" ? String(pokemon.id) : `${deck.id}:${pokemon.id}`;

// Every card any deck can ask, with its stats key — the Stats tab lists
// them per review status.
export interface CardRef {
  deck: Deck;
  pokemon: Pokemon;
  key: string;
}

export function allCardRefs(): CardRef[] {
  return DECKS.flatMap((deck) => deckPool(deck).map((pokemon) => ({ deck, pokemon, key: cardKey(deck, pokemon) })));
}

export function allCardKeys(): string[] {
  return allCardRefs().map((ref) => ref.key);
}

// A card on the table: which deck, which Pokémon, and what it asks about.
export interface Card {
  deckId: string;
  pokemonId: number;
  param: string | null;
}

// What was submitted: the option ids, "gaveup", or null while unanswered.
export type Picked = string[] | "gaveup" | null;

// A card as it was left: answered (or not), with whatever was picked.
export interface CardState {
  card: Card;
  picked: Picked;
  selection: string[];
}

// How many cards Back can step through
export const HISTORY_LIMIT = 30;

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
  // the cards before this one, oldest first (Back steps through them)
  history: CardState[];
  // the cards Back stepped away from, nearest last (Next returns to them)
  forward: CardState[];
  // the Submit that can still be taken back: its recordAttempt token and
  // the card it graded (memory-only — an undo never survives a reload).
  // Keying by card means navigation needs no bookkeeping: the Undo button
  // simply hides while another card is shown, and comes back with the
  // card as long as nothing newer was recorded anywhere.
  undo: { token: number; key: string } | null;
}

// What saveSession writes: everything but `next` (cheap to re-pick) and
// `undo` (an undo never survives a reload).
type StoredSession = Omit<CardSession, "next" | "undo">;

const isCardState = (value: unknown): value is CardState => {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Partial<CardState>;
  return typeof state.card === "object" && state.card !== null && DECK_BY_ID.has(state.card.deckId) && Array.isArray(state.selection);
};

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
  history: [],
  forward: [],
  undo: null,
  ...(isStoredSession(stored) ? stored : {}),
};
// sessions stored before Back existed have no history; a damaged one is dropped
session.history = Array.isArray(session.history) ? session.history.filter(isCardState) : [];
session.forward = Array.isArray(session.forward) ? session.forward.filter(isCardState) : [];

export function saveSession(): void {
  const { deckId, card, picked, selection, recent, history, forward } = session;
  saveJson(SESSION_KEY, { deckId, card, picked, selection, recent, history, forward } satisfies StoredSession);
}
