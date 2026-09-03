// Flashcard decks — the four deckable category groups (Region, Type,
// Group, Stage), plus pairwise Combo decks ("combo:type+region") that ask
// two of them about the same Pokémon in sequence. Each deck shows a
// Pokémon and asks one question over a fixed set of answer buttons; a
// card can have several correct answers (a dual type, a form counting
// for two regions, Koraidon being Paradox and Legendary). Single-pick
// decks accept any of them; the multi Type deck wants the exact set.

import { CATEGORIES, CATEGORY_BY_ID, getCategory } from "../data/categories.ts";
import type { Category } from "../data/categories.ts";
import { POKEMON, POKEMON_BY_ID } from "../data/pokedex.ts";
import { FLAGS } from "../data/types.ts";
import type { Flag, Pokemon } from "../data/types.ts";
import { loadJson, saveJson } from "./hashState.ts";
import { scheduleStatus } from "./schedule.ts";
import type { MergedStats } from "./stats.ts";

// An answer button: always a category of the deck's group.
export interface DeckOption {
  id: string;
  label: string;
  short: string;
}

export interface Deck {
  id: string;
  label: string;
  // the card's prompt — also the deck sheet's subtitle
  question: string;
  // a dimmer aside after the prompt ("pick all")
  questionNote?: string;
  // every answer must be picked (Type); single-pick decks accept any one
  multi?: boolean;
  // answer-pad grid columns
  cols: number;
  options: DeckOption[];
  // the option ids that are right for this Pokémon
  answers: (pokemon: Pokemon) => string[];
  // whether the deck can ask about this Pokémon at all
  eligible: (pokemon: Pokemon) => boolean;
  // how much more often than normal to ask about this Pokémon
  bias: (pokemon: Pokemon) => number;
}

const isMegaOrGmax = (pokemon: Pokemon): boolean =>
  pokemon.flags.includes("mega") || pokemon.flags.includes("gmax");
// A regional form is named for its region ("Growlithe Hisui", "Tauros
// Paldea Combat Breed"), so a region question about it answers itself
const REGIONAL_FORM = /^(Alola|Galar|Hisui|Paldea)(-|$)/;
const isRegionalForm = (pokemon: Pokemon): boolean => pokemon.form !== null && REGIONAL_FORM.test(pokemon.form);
const baseOf = (pokemon: Pokemon): Pokemon => POKEMON_BY_ID.get(pokemon.species) ?? pokemon;
const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((item, index) => item === b[index]);

// every flag except the two form kinds, straight from the canonical list
export const SPECIAL_FLAGS: Flag[] = FLAGS.filter((flag) => flag !== "mega" && flag !== "gmax");

export const DECKS: Deck[] = [
  {
    id: "region",
    label: "Region",
    question: "Which region?",
    cols: 5, // ten regions: two full rows
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
    question: "What type?",
    questionNote: "pick all",
    multi: true, // both types of a dual type, then Submit
    cols: 6, // eighteen types: three full rows
    options: CATEGORIES.filter((category) => category.group === "type"),
    answers: (pokemon) => pokemon.types.map((type) => `type-${type}`),
    // Megas can change type (Charizard Mega X); Gmax never does
    eligible: (pokemon) => !pokemon.flags.includes("gmax"),
    bias: () => 1,
  },
  {
    id: "special",
    label: "Group",
    question: "Which group?",
    cols: 3,
    options: SPECIAL_FLAGS.map((flag) => getCategory(`flag-${flag}`)),
    answers: (pokemon) => SPECIAL_FLAGS.filter((flag) => pokemon.flags.includes(flag)).map((flag) => `flag-${flag}`),
    // Only Pokémon that are in a group: the ~900 regular ones would swamp
    // the deck and teach nothing
    eligible: (pokemon) => !isMegaOrGmax(pokemon) && pokemon.flags.some((flag) => SPECIAL_FLAGS.includes(flag)),
    bias: () => 1,
  },
  {
    id: "stage",
    label: "Stage",
    question: "Evolution stage?",
    cols: 2,
    options: [
      getCategory("stage-first"),
      getCategory("stage-middle"),
      getCategory("stage-final"),
      // the pad's terse label; the category pill keeps "No Evolution Line"
      { ...getCategory("stage-single"), short: "Doesn't Evolve" },
    ],
    answers: (pokemon) => [`stage-${pokemon.stage}`],
    eligible: (pokemon) => pokemon.stage !== null && !isMegaOrGmax(pokemon),
    bias: () => 1,
  },
];

export const DECK_BY_ID = new Map<string, Deck>(DECKS.map((deck) => [deck.id, deck]));

function deckById(deckId: string): Deck {
  const deck = DECK_BY_ID.get(deckId);
  if (!deck) throw new Error(`unknown deck: ${deckId}`);
  return deck;
}

// ---- combo decks: one card asking two groups in sequence ----

// The pairwise combos, in the deck sheet's order.
const COMBO_PAIRS = [
  ["type", "region"],
  ["type", "stage"],
  ["type", "special"],
  ["region", "stage"],
  ["region", "special"],
  ["stage", "special"],
] as const;

export const COMBO_IDS: string[] = COMBO_PAIRS.map(([a, b]) => `combo:${a}+${b}`);

// The two sub-decks of a combo id, or null for anything else.
export function comboParts(deckId: string): [Deck, Deck] | null {
  if (!COMBO_IDS.includes(deckId)) return null;
  const [a, b] = deckId.slice("combo:".length).split("+");
  return [deckById(a), deckById(b)];
}

export const isDeckId = (id: string): boolean => id === "all" || DECK_BY_ID.has(id) || COMBO_IDS.includes(id);

// "Region", "Type × Region", "All decks" — the chooser and the Stats lists.
export function deckLabel(deckId: string): string {
  if (deckId === "all") return "All decks";
  const parts = comboParts(deckId);
  if (parts) return `${parts[0].label} × ${parts[1].label}`;
  return deckById(deckId).label;
}

// Every option id the card can answer with — a combo's union. Attempts
// are recorded against all of them.
export function deckAnswers(deckId: string, pokemon: Pokemon): string[] {
  const parts = comboParts(deckId);
  return parts ? parts.flatMap((part) => part.answers(pokemon)) : deckById(deckId).answers(pokemon);
}

// A combo only asks Pokémon both its sub-decks would ask.
export function deckEligible(deckId: string, pokemon: Pokemon): boolean {
  const parts = comboParts(deckId);
  return parts ? parts.every((part) => part.eligible(pokemon)) : deckById(deckId).eligible(pokemon);
}

export function deckBias(deckId: string, pokemon: Pokemon): number {
  const parts = comboParts(deckId);
  return parts ? parts[0].bias(pokemon) * parts[1].bias(pokemon) : deckById(deckId).bias(pokemon);
}

// Single-pick decks accept any of the Pokémon's answers (Koraidon is
// Legendary and Paradox); multi decks (Type) need the exact set.
export function isRightPick(deck: Deck, picks: string[], answers: string[]): boolean {
  if (!picks.length) return false;
  if (!deck.multi) return answers.includes(picks[0]);
  return picks.length === answers.length && picks.every((id) => answers.includes(id));
}

// A form is only worth its own card when the deck's answer differs from
// the base species' (Growlithe Hisui: yes; Charizard Mega Y: no).
const distinctFromBase = (deckId: string, pokemon: Pokemon): boolean =>
  pokemon.form === null || !sameList(deckAnswers(deckId, pokemon), deckAnswers(deckId, baseOf(pokemon)));

// The Pokémon a deck can ask about, computed once per deck id.
const poolCache = new Map<string, Pokemon[]>();
export function deckPool(deckId: string): Pokemon[] {
  let pool = poolCache.get(deckId);
  if (!pool) {
    pool = POKEMON.filter((pokemon) => deckEligible(deckId, pokemon) && distinctFromBase(deckId, pokemon));
    poolCache.set(deckId, pool);
  }
  return pool;
}

// ---- focus filters: constrain the pool every deck draws from ----

export type FocusFacet = "region" | "type" | "stage" | "evo" | "special";

export const FOCUS_FACETS: ReadonlyArray<readonly [FocusFacet, string]> = [
  ["region", "Regions"],
  ["type", "Types"],
  ["stage", "Evolution Stage"],
  ["evo", "Evolution Method"],
  ["special", "Groups"],
];

// facet -> the category ids selected in it; missing or empty = everything
export type CardFilter = Partial<Record<FocusFacet, string[]>>;

// The chips a facet offers — its quizzable categories (stage without the
// derived Not Fully Evolved, groups without the Mega/Gmax form kinds).
const facetCache = new Map<FocusFacet, Category[]>();
export function facetCategories(facet: FocusFacet): Category[] {
  let cats = facetCache.get(facet);
  if (!cats) {
    cats =
      facet === "special"
        ? SPECIAL_FLAGS.map((flag) => getCategory(`flag-${flag}`))
        : facet === "stage"
          ? ["stage-first", "stage-middle", "stage-final", "stage-single"].map(getCategory)
          : CATEGORIES.filter((category) => category.group === facet);
    facetCache.set(facet, cats);
  }
  return cats;
}

export const filterCount = (filter: CardFilter): number =>
  FOCUS_FACETS.reduce((count, [facet]) => count + (filter[facet]?.length ?? 0), 0);

// OR within a facet, AND across facets; empty facets match everything.
export function matchesFocus(pokemon: Pokemon, filter: CardFilter): boolean {
  return FOCUS_FACETS.every(([facet]) => {
    const chosen = filter[facet];
    if (!chosen?.length) return true;
    return chosen.some((id) => CATEGORY_BY_ID.get(id)?.predicate(pokemon));
  });
}

// A deck's pool narrowed to the focus filter, cached per (deck, filter) —
// re-filtering on every card advance is the app's hottest path, and a
// user only ever has a handful of filter states.
const focusPoolCache = new Map<string, Pokemon[]>();
export function focusedDeckPool(deckId: string, filter: CardFilter): Pokemon[] {
  const signature = FOCUS_FACETS.map(([facet]) => (filter[facet] ?? []).slice().sort().join(",")).join("|");
  if (signature === "||||") return deckPool(deckId);
  const key = `${deckId}#${signature}`;
  let pool = focusPoolCache.get(key);
  if (!pool) {
    pool = deckPool(deckId).filter((pokemon) => matchesFocus(pokemon, filter));
    focusPoolCache.set(key, pool);
  }
  return pool;
}

// The filter sheet's live count: everyone the current deck could ask
// under the filter ("all": anyone some deck could ask).
export function focusPoolSize(deckId: string, filter: CardFilter): number {
  if (deckId === "all") return new Set(DECKS.flatMap((deck) => focusedDeckPool(deck.id, filter))).size;
  return focusedDeckPool(deckId, filter).length;
}

const FILTER_KEY = "pokedoku-study:card-filter:v1";

export function loadCardFilter(): CardFilter {
  const saved = loadJson(FILTER_KEY);
  if (typeof saved !== "object" || saved === null || Array.isArray(saved)) return {};
  const filter: CardFilter = {};
  for (const [facet] of FOCUS_FACETS) {
    const ids = (saved as Record<string, unknown>)[facet];
    if (!Array.isArray(ids)) continue;
    const valid = new Set(facetCategories(facet).map((category) => category.id));
    const kept = ids.filter((id): id is string => typeof id === "string" && valid.has(id));
    if (kept.length) filter[facet] = kept;
  }
  return filter;
}

export function saveCardFilter(filter: CardFilter): void {
  saveJson(FILTER_KEY, filter);
}

// ---- stats keys and the review universe ----

// Stats key for a card. The region deck keeps the bare species id so
// history recorded before decks existed still counts.
export const cardKey = (deckId: string, pokemon: Pokemon): string =>
  deckId === "region" ? String(pokemon.id) : `${deckId}:${pokemon.id}`;

// Every card any deck can ask, with its stats key — the Stats tab lists
// them per review status, and the due counter walks them.
export interface CardRef {
  deckId: string;
  // "Region", "Type × Region" — for the Stats review lists
  label: string;
  pokemon: Pokemon;
  key: string;
}

let cardRefsCache: CardRef[] | null = null;
export function allCardRefs(): CardRef[] {
  cardRefsCache ??= [...DECKS.map((deck) => deck.id), ...COMBO_IDS].flatMap((deckId) => {
    const label = deckLabel(deckId);
    return deckPool(deckId).map((pokemon) => ({ deckId, label, pokemon, key: cardKey(deckId, pokemon) }));
  });
  return cardRefsCache;
}

export function allCardKeys(): string[] {
  return allCardRefs().map((ref) => ref.key);
}

// How many cards are due for review right now — the header's "48 due"
// and the Stats tab's "Review 48 due cards".
export function dueCardCount(merged: MergedStats, now: number = Date.now()): number {
  let due = 0;
  for (const ref of allCardRefs()) if (scheduleStatus(merged.flashcards[ref.key], now) === "due") due += 1;
  return due;
}

// ---- the current card, mirrored to localStorage ----

// A card on the table: which deck, which Pokémon.
export interface Card {
  deckId: string;
  pokemonId: number;
}

// What was submitted: the graded picks, "gaveup", or null while unanswered.
export type Picked = string[] | "gaveup" | null;

// Per-part results of an answered combo card.
export interface ComboVerdict {
  a: boolean;
  b: boolean;
}

export type DashResult = "correct" | "wrong";

export interface CardSession {
  // the deck in play, or "all"
  deckId: string;
  card: Card | null;
  // the card after this one, picked early so its sprite can preload
  next: Card | null;
  // options toggled so far on the part being asked
  selection: string[];
  // which combo part the pad is on (plain decks stay 0)
  part: 0 | 1;
  // the first part's picks, once a combo advanced past it
  partASel: string[];
  picked: Picked;
  comboOk: ComboVerdict | null;
  // last few Pokémon ids, to avoid immediate repeats
  recent: number[];
  // the last few results, oldest first, for the header dashes
  dashes: DashResult[];
  // the answer that can still be taken back: its recordAttempt token and
  // the card it graded (memory-only — an undo never survives a reload)
  undo: { token: number; key: string } | null;
}

// What saveSession writes: everything but `next` (cheap to re-pick) and
// `undo` (an undo never survives a reload).
type StoredSession = Omit<CardSession, "next" | "undo">;

function isStoredSession(value: unknown): value is StoredSession {
  if (typeof value !== "object" || value === null) return false;
  const stored = value as Partial<StoredSession>;
  const cardOk =
    stored.card === null ||
    (typeof stored.card === "object" && stored.card !== null && isDeckId((stored.card as Card).deckId));
  return (
    typeof stored.deckId === "string" &&
    isDeckId(stored.deckId) &&
    cardOk &&
    Array.isArray(stored.selection) &&
    Array.isArray(stored.recent)
  );
}

// The current card survives tab switches and reloads: the Cards tab reads
// its initial state from here, writes every change back, and saveSession
// mirrors it to localStorage.
const SESSION_KEY = "pokedoku-study:cards:v2";
const stored = loadJson(SESSION_KEY);
// the redesign's predecessors, left behind in every existing browser
for (const staleKey of ["pokedoku-study:cards:v1", "pokedoku-study:cards:filters:v1"]) saveJson(staleKey, null);
export const session: CardSession = {
  deckId: "all",
  card: null,
  next: null,
  selection: [],
  part: 0,
  partASel: [],
  picked: null,
  comboOk: null,
  recent: [],
  dashes: [],
  undo: null,
  ...(isStoredSession(stored) ? stored : {}),
};
// fields newer than a stored session get sane shapes back
session.part = session.part === 1 ? 1 : 0;
session.partASel = Array.isArray(session.partASel) ? session.partASel : [];
session.dashes = Array.isArray(session.dashes)
  ? session.dashes.filter((dash) => dash === "correct" || dash === "wrong")
  : [];

export function saveSession(): void {
  const { deckId, card, selection, part, partASel, picked, comboOk, recent, dashes } = session;
  saveJson(SESSION_KEY, {
    deckId,
    card,
    selection,
    part,
    partASel,
    picked,
    comboOk,
    recent,
    dashes,
  } satisfies StoredSession);
}

// The Stats tab's Cards buttons land here: the next mount of the Cards
// tab deals a fresh card from `deckId`.
export function resetSessionForDeck(deckId: string): void {
  session.deckId = deckId;
  session.card = null;
  session.next = null;
  session.selection = [];
  session.part = 0;
  session.partASel = [];
  session.picked = null;
  session.comboOk = null;
  session.undo = null;
  saveSession();
}
