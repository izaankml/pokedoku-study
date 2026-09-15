// Flashcard decks: one per category group, plus pairwise Combo decks
// ("combo:type+region") that ask two of them about one Pokémon, and a
// Natures deck about the 25 natures. A card can have several right
// answers; single-pick decks accept any, multi decks want the exact set.

import { CATEGORIES, CATEGORY_BY_ID, getCategory } from "../data/categories.ts";
import type { Category } from "../data/categories.ts";
import { NATURES, NATURE_BY_ID, STAT_LABELS, STAT_NAMES } from "../data/natures.ts";
import type { Nature } from "../data/natures.ts";
import { POKEMON, POKEMON_BY_ID, POKEMON_BY_NAME } from "../data/pokedex.ts";
import { weaknessesOf } from "../data/typechart.ts";
import { FLAGS } from "../data/types.ts";
import type { Flag, Pokemon } from "../data/types.ts";
import { loadJson, saveJson } from "./hashState.ts";
import { scheduleStatus } from "./schedule.ts";
import type { MergedStats } from "./stats.ts";

// What a card is about: a Pokémon on every deck but Natures, whose cards
// are the natures. A deck's pool holds one kind only.
export type Subject = Pokemon | Nature;
export type SubjectId = Subject["id"];

export const isNature = (subject: Subject): subject is Nature => "raised" in subject;

const pokemonOf = (subject: Subject): Pokemon => {
  if (isNature(subject)) throw new Error(`a nature on a Pokémon deck: ${subject.id}`);
  return subject;
};

const natureOf = (subject: Subject): Nature => {
  if (!isNature(subject)) throw new Error(`a Pokémon on the Natures deck: ${subject.id}`);
  return subject;
};

// An answer button: a category of the deck's group, or a stat on the
// Natures deck.
export interface DeckOption {
  id: string;
  label: string;
  short: string;
}

interface DeckBase {
  id: string;
  label: string;
  // the card's prompt, also the deck sheet's subtitle
  question: string;
  // a dimmer aside after the prompt ("pick all")
  questionNote?: string;
  // every answer must be picked (Type); single-pick decks accept any one
  multi?: boolean;
  // the answer is typed, not picked: the Pokémon's own name via the
  // autocomplete (options stay empty)
  input?: "name";
  // answer-pad grid columns
  cols: number;
  options: DeckOption[];
  // two pads asked at once about one card (Natures: the raised stat and
  // the lowered one), each graded on its own like a combo's
  parts?: [Deck, Deck];
}

// A deck about Pokémon: its pool is the dex, narrowed by `eligible`.
export interface PokemonDeck extends DeckBase {
  // the option ids that are right for this Pokémon
  answers: (pokemon: Pokemon) => string[];
  // the categories an attempt is credited to, when not the answers
  // themselves (a Matchups card is type-chart knowledge, not typing)
  categories?: (pokemon: Pokemon) => string[];
  // whether the deck can ask about this Pokémon at all
  eligible: (pokemon: Pokemon) => boolean;
  // how much more often than normal to ask about this Pokémon
  bias: (pokemon: Pokemon) => number;
}

// A deck about the natures: every nature is asked, none is credited to
// a PokeDoku category.
export interface NatureDeck extends DeckBase {
  about: "nature";
  answers: (nature: Nature) => string[];
  categories: () => string[];
}

export type Deck = PokemonDeck | NatureDeck;

export const isNatureDeck = (deck: Deck): deck is NatureDeck => "about" in deck;

// A pad's answers for the card's subject.
export function partAnswers(deck: Deck, subject: Subject): string[] {
  return isNatureDeck(deck) ? deck.answers(natureOf(subject)) : deck.answers(pokemonOf(subject));
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

// Forms that share a sprite, so Who's That takes any of their names for
// any of them. Recolours stay distinct. The first of a group is dealt.
const LOOKALIKE_GROUPS: ReadonlyArray<readonly string[]> = [
  ["pikachu", "pikachustarter"],
  ["eevee", "eeveestarter"],
  ["pumpkaboo", "pumpkaboosmall", "pumpkaboolarge", "pumpkaboosuper"],
  ["gourgeist", "gourgeistsmall", "gourgeistlarge", "gourgeistsuper"],
  ["rockruff", "rockruffdusk"],
  ["toxtricitygmax", "toxtricitylowkeygmax"],
];
const LOOKALIKES = new Map<string, string[]>();
for (const group of LOOKALIKE_GROUPS) {
  const ids = group.map((slug) => {
    const pokemon = POKEMON_BY_NAME.get(slug);
    if (!pokemon) throw new Error(`unknown lookalike: ${slug}`);
    return String(pokemon.id);
  });
  for (const slug of group) LOOKALIKES.set(slug, ids);
}
// the ids Who's That accepts for a Pokémon: its lookalike group, else itself
export const lookalikeAnswers = (pokemon: Pokemon): string[] => LOOKALIKES.get(pokemon.name) ?? [String(pokemon.id)];

// ---- the Natures deck: the raised stat on one pad, the lowered on another ----

type StatSide = "up" | "down";

// The five stats and None (a neutral nature), on a pad of the given side.
// Option ids carry the side, so deckPicks tells the two pads apart.
const statOptions = (side: StatSide): DeckOption[] => [
  ...STAT_NAMES.map((stat) => ({ id: `nature-${side}-${stat}`, ...STAT_LABELS[stat] })),
  { id: `nature-${side}-none`, label: "None", short: "None" },
];

const NATURE_RAISED: NatureDeck = {
  about: "nature",
  id: "nature-up",
  label: "Raised",
  question: "Which stat is raised?",
  cols: 3, // the five stats and None: two rows of three
  options: statOptions("up"),
  answers: (nature) => [`nature-up-${nature.raised ?? "none"}`],
  categories: () => [],
};

const NATURE_LOWERED: NatureDeck = {
  about: "nature",
  id: "nature-down",
  label: "Lowered",
  question: "Which stat is lowered?",
  cols: 3,
  options: statOptions("down"),
  answers: (nature) => [`nature-down-${nature.lowered ?? "none"}`],
  categories: () => [],
};

// The deck in the chooser; its card is the two pads above, submitted
// together and graded each on its own.
const NATURE_DECK: NatureDeck = {
  about: "nature",
  id: "nature",
  label: "Natures",
  question: "Which stat rises, which falls?",
  parts: [NATURE_RAISED, NATURE_LOWERED],
  cols: 3,
  options: [...NATURE_RAISED.options, ...NATURE_LOWERED.options],
  answers: (nature) => [...NATURE_RAISED.answers(nature), ...NATURE_LOWERED.answers(nature)],
  categories: () => [],
};

const POKEMON_DECKS: PokemonDeck[] = [
  {
    id: "region",
    label: "Region",
    question: "Which region?",
    questionNote: "pick all",
    multi: true, // every region it counts for (a dual-region form has two), then Submit
    cols: 4, // ten regions: two full rows and a short one
    options: CATEGORIES.filter((category) => category.group === "region"),
    answers: (pokemon) => pokemon.regions.map((region) => `region-${region}`),
    // not the regional forms, whose names give the answer away; dual-region
    // forms (White-Striped Basculin, Bloodmoon Ursaluna) stay
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
    cols: 5, // eighteen types: three full rows and a short one
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
    cols: 4,
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
    cols: 4, // the four stages on one row
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
  {
    id: "matchup",
    label: "Matchups",
    question: "Weak to?",
    questionNote: "pick all",
    multi: true, // every type that hits it super-effectively, then Submit
    cols: 5,
    options: CATEGORIES.filter((category) => category.group === "type"),
    answers: (pokemon) => weaknessesOf(pokemon.types).map((type) => `type-${type}`),
    // pure type-chart knowledge; never credits the type categories
    categories: () => [],
    // Gmax never changes type; every Gen 6+ typing has a weakness, but guard anyway
    eligible: (pokemon) => !pokemon.flags.includes("gmax") && weaknessesOf(pokemon.types).length > 0,
    bias: () => 1,
  },
  {
    id: "name",
    label: "Who's That?",
    question: "Who's that Pokémon?",
    input: "name",
    cols: 1,
    options: [],
    // the record itself, or any of the forms that look the same as it:
    // otherwise form names must be exact, as on PokeDoku
    answers: lookalikeAnswers,
    categories: () => [],
    // a lookalike group is dealt once, as its first member
    eligible: (pokemon) => lookalikeAnswers(pokemon)[0] === String(pokemon.id),
    bias: () => 1,
  },
];

export const DECKS: Deck[] = [...POKEMON_DECKS, NATURE_DECK];

export const DECK_BY_ID = new Map<string, Deck>(DECKS.map((deck) => [deck.id, deck]));

const isNatureDeckId = (deckId: string): boolean => {
  const deck = DECK_BY_ID.get(deckId);
  return deck !== undefined && isNatureDeck(deck);
};

function deckById(deckId: string): Deck {
  const deck = DECK_BY_ID.get(deckId);
  if (!deck) throw new Error(`unknown deck: ${deckId}`);
  return deck;
}

// ---- combo decks: one card asking two groups at once ----

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

// The two pads of a card: a combo's two decks, or a deck's own parts
// (Natures); null for a deck with one pad.
export function deckParts(deckId: string): [Deck, Deck] | null {
  if (COMBO_IDS.includes(deckId)) {
    const [a, b] = deckId.slice("combo:".length).split("+");
    return [deckById(a), deckById(b)];
  }
  return DECK_BY_ID.get(deckId)?.parts ?? null;
}

export const isDeckId = (id: string): boolean => id === "all" || DECK_BY_ID.has(id) || COMBO_IDS.includes(id);

// "Region", "Type × Region", "All decks": the chooser and the Stats lists.
export function deckLabel(deckId: string): string {
  if (deckId === "all") return "All decks";
  if (COMBO_IDS.includes(deckId)) {
    const [a, b] = deckParts(deckId) as [Deck, Deck];
    return `${a.label} × ${b.label}`;
  }
  return deckById(deckId).label;
}

// Every option id the card can answer with (a combo's union). Attempts
// are recorded against all of them.
export function deckAnswers(deckId: string, subject: Subject): string[] {
  const parts = deckParts(deckId);
  return parts ? parts.flatMap((part) => partAnswers(part, subject)) : partAnswers(deckById(deckId), subject);
}

// What an attempt is credited to: the answers, unless the deck says
// otherwise (a combo's parts each their own way).
export function deckCategories(deckId: string, subject: Subject): string[] {
  const credited = (deck: Deck): string[] =>
    isNatureDeck(deck) ? deck.categories() : (deck.categories ?? deck.answers)(pokemonOf(subject));
  const parts = deckParts(deckId);
  return parts ? parts.flatMap(credited) : credited(deckById(deckId));
}

// A combo only asks Pokémon both its sub-decks would ask.
export function deckEligible(deckId: string, subject: Subject): boolean {
  const eligible = (deck: Deck): boolean =>
    isNatureDeck(deck) ? isNature(subject) : !isNature(subject) && deck.eligible(subject);
  const parts = deckParts(deckId);
  return parts ? parts.every(eligible) : eligible(deckById(deckId));
}

export function deckBias(deckId: string, subject: Subject): number {
  const bias = (deck: Deck): number => (isNatureDeck(deck) ? 1 : deck.bias(pokemonOf(subject)));
  const parts = deckParts(deckId);
  return parts ? bias(parts[0]) * bias(parts[1]) : bias(deckById(deckId));
}

// Single-pick decks accept any of the Pokémon's answers (Koraidon is
// Legendary and Paradox); multi decks (Type) need the exact set.
export function isRightPick(deck: Deck, picks: string[], answers: string[]): boolean {
  if (!picks.length) return false;
  if (!deck.multi) return answers.includes(picks[0]);
  return picks.length === answers.length && picks.every((id) => answers.includes(id));
}

// One deck's share of a combo card's picks, which both pads keep in one
// list. Option ids carry their group (type-…, region-…), so the split is
// exact.
export function deckPicks(deck: Deck, picks: string[]): string[] {
  return picks.filter((id) => deck.options.some((option) => option.id === id));
}

// A form is only worth its own card when the deck's answer differs from
// the base species' (Growlithe Hisui: yes; Charizard Mega Y: no).
const distinctFromBase = (deckId: string, pokemon: Pokemon): boolean =>
  pokemon.form === null || !sameList(deckAnswers(deckId, pokemon), deckAnswers(deckId, baseOf(pokemon)));

// The cards a deck can deal (the Natures deck: every nature), computed
// once per deck id.
const poolCache = new Map<string, Subject[]>();
export function deckPool(deckId: string): Subject[] {
  let pool = poolCache.get(deckId);
  if (!pool) {
    pool = isNatureDeckId(deckId)
      ? [...NATURES]
      : POKEMON.filter((pokemon) => deckEligible(deckId, pokemon) && distinctFromBase(deckId, pokemon));
    poolCache.set(deckId, pool);
  }
  return pool;
}

// The card's subject by its id, or undefined for an id the deck has no
// card for.
export function findSubject(deckId: string, subjectId: SubjectId): Subject | undefined {
  return isNatureDeckId(deckId) ? NATURE_BY_ID.get(String(subjectId)) : POKEMON_BY_ID.get(Number(subjectId));
}

// The single decks a deal from `deckId` can draw on: the deck itself, or
// for All every Pokémon deck, and Natures while no focus filter is set
// (a filter narrows the deal to Pokémon).
export function dealtDeckIds(deckId: string, filter: CardFilter): string[] {
  if (deckId !== "all") return [deckId];
  const filtered = filterCount(filter) > 0;
  return DECKS.filter((deck) => !(filtered && isNatureDeck(deck))).map((deck) => deck.id);
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

// The chips a facet offers: its quizzable categories (stage without the
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
// The facets are about Pokémon, so a nature is never filtered out.
export function matchesFocus(subject: Subject, filter: CardFilter): boolean {
  if (isNature(subject)) return true;
  return FOCUS_FACETS.every(([facet]) => {
    const chosen = filter[facet];
    if (!chosen?.length) return true;
    return chosen.some((id) => CATEGORY_BY_ID.get(id)?.predicate(subject));
  });
}

// A deck's pool narrowed to the focus filter, cached per (deck, filter):
// it runs on every card advance, and a user has few filter states.
const focusPoolCache = new Map<string, Subject[]>();
export function focusedDeckPool(deckId: string, filter: CardFilter): Subject[] {
  const signature = FOCUS_FACETS.map(([facet]) => (filter[facet] ?? []).slice().sort().join(",")).join("|");
  if (signature === "||||" || isNatureDeckId(deckId)) return deckPool(deckId);
  const key = `${deckId}#${signature}`;
  let pool = focusPoolCache.get(key);
  if (!pool) {
    pool = deckPool(deckId).filter((subject) => matchesFocus(subject, filter));
    focusPoolCache.set(key, pool);
  }
  return pool;
}

// The filter sheet's live count: every Pokémon the current deck could
// ask under the filter ("all": anyone some Pokémon deck could ask).
export function focusPoolSize(deckId: string, filter: CardFilter): number {
  const deckIds = dealtDeckIds(deckId, filter).filter((id) => !isNatureDeckId(id));
  return new Set(deckIds.flatMap((id) => focusedDeckPool(id, filter))).size;
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

// Who's That shows a silhouette until answered; the pad's eye button
// turns that off (the sprite in full, the name still hidden), remembered
// across cards and reloads.
const SILHOUETTE_KEY = "pokedoku-study:cards:silhouette:v1";

export const loadSilhouette = (): boolean => loadJson(SILHOUETTE_KEY) !== false;

export function saveSilhouette(on: boolean): void {
  saveJson(SILHOUETTE_KEY, on);
}

// ---- stats keys and the review universe ----

// Stats key for a card. The region deck keeps the bare species id so
// history recorded before decks existed still counts.
export const cardKey = (deckId: string, subject: Subject): string =>
  deckId === "region" ? String(subject.id) : `${deckId}:${subject.id}`;

// Every card any deck can ask, with its stats key. The Stats tab lists
// them per review status, and the due counter walks them.
export interface CardRef {
  deckId: string;
  // "Region", "Type × Region", for the Stats review lists
  label: string;
  subject: Subject;
  key: string;
}

let cardRefsCache: CardRef[] | null = null;
export function allCardRefs(): CardRef[] {
  cardRefsCache ??= [...DECKS.map((deck) => deck.id), ...COMBO_IDS].flatMap((deckId) => {
    const label = deckLabel(deckId);
    return deckPool(deckId).map((subject) => ({ deckId, label, subject, key: cardKey(deckId, subject) }));
  });
  return cardRefsCache;
}

export function allCardKeys(): string[] {
  return allCardRefs().map((ref) => ref.key);
}

// What the Cards tab can deal: the deck in play (All: every single
// deck), narrowed to the focus filter.
export interface DealScope {
  deckId: string;
  filter: CardFilter;
}

// How many cards are due for review right now: over every deck for the
// Stats tab, or over just the cards a deck and filter can deal for the
// Cards header.
export function dueCardCount(merged: MergedStats, now: number = Date.now(), scope?: DealScope): number {
  let due = 0;
  const isDue = (key: string): boolean => scheduleStatus(merged.flashcards[key], now) === "due";
  if (!scope) {
    for (const ref of allCardRefs()) if (isDue(ref.key)) due += 1;
    return due;
  }
  for (const deckId of dealtDeckIds(scope.deckId, scope.filter)) {
    for (const subject of focusedDeckPool(deckId, scope.filter)) if (isDue(cardKey(deckId, subject))) due += 1;
  }
  return due;
}

// ---- the current card, mirrored to localStorage ----

// A card on the table: which deck, which Pokémon or nature.
export interface Card {
  deckId: string;
  subjectId: SubjectId;
}

export function subjectOf(card: Card): Subject {
  const subject = findSubject(card.deckId, card.subjectId);
  if (!subject) throw new Error(`unknown card: ${card.deckId} ${card.subjectId}`);
  return subject;
}

// A stored card, in its current shape or the one from before the Natures
// deck (a pokemonId); null for anything no deck can deal.
function storedCard(value: unknown): Card | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as { deckId?: unknown; subjectId?: unknown; pokemonId?: unknown };
  if (typeof raw.deckId !== "string" || !isDeckId(raw.deckId)) return null;
  const subjectId = raw.subjectId ?? raw.pokemonId;
  if (typeof subjectId !== "number" && typeof subjectId !== "string") return null;
  return findSubject(raw.deckId, subjectId) ? { deckId: raw.deckId, subjectId } : null;
}

// What was submitted: the graded picks, "gaveup", or null while unanswered.
export type Picked = string[] | "gaveup" | null;

// Per-part results of an answered combo card.
export interface ComboVerdict {
  a: boolean;
  b: boolean;
}

export type DashResult = "correct" | "wrong";

// An answered card kept behind the live one, for Back: shown again as
// it was graded.
export interface PastCard {
  card: Card;
  picked: string[] | "gaveup";
  comboOk: ComboVerdict | null;
}

// how many answered cards Back can step through
export const HISTORY_MAX = 20;

export interface CardSession {
  // the deck in play, or "all"
  deckId: string;
  card: Card | null;
  // the card after this one, picked early so its sprite can preload
  next: Card | null;
  // options toggled so far, a combo's two pads together (deckPicks tells
  // them apart)
  selection: string[];
  picked: Picked;
  comboOk: ComboVerdict | null;
  // the last few cards' subject ids, to avoid immediate repeats
  recent: SubjectId[];
  // the last few results, oldest first, for the header dashes
  dashes: DashResult[];
  // the last few answered cards, oldest first, for Back
  history: PastCard[];
  // which of them is on the table instead of the live card (null: the
  // live card)
  viewing: number | null;
  // the answer that can still be taken back: its recordAttempt token and
  // the card it graded (memory-only; an undo never survives a reload)
  undo: { token: number; key: string } | null;
}

// What saveSession writes: everything but `next` (cheap to re-pick) and
// `undo` (an undo never survives a reload).
type StoredSession = Omit<CardSession, "next" | "undo">;

// The stored fields other than the cards, which storedCard reads on
// their own below.
function isStoredSession(value: unknown): value is StoredSession {
  if (typeof value !== "object" || value === null) return false;
  const stored = value as Partial<StoredSession>;
  return (
    typeof stored.deckId === "string" &&
    isDeckId(stored.deckId) &&
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
  picked: null,
  comboOk: null,
  recent: [],
  dashes: [],
  history: [],
  viewing: null,
  undo: null,
  ...(isStoredSession(stored) ? stored : {}),
};
// the cards in their current shape; fields newer than a stored session
// get sane shapes back
session.card = storedCard(session.card);
session.recent = session.recent.filter((id) => typeof id === "number" || typeof id === "string");
session.dashes = Array.isArray(session.dashes)
  ? session.dashes.filter((dash) => dash === "correct" || dash === "wrong")
  : [];
const pastCardOf = (value: unknown): PastCard | null => {
  if (typeof value !== "object" || value === null) return null;
  const past = value as Partial<PastCard>;
  const card = storedCard(past.card);
  if (!card || !(past.picked === "gaveup" || Array.isArray(past.picked))) return null;
  return { card, picked: past.picked, comboOk: past.comboOk ?? null };
};
session.history = Array.isArray(session.history)
  ? session.history.map(pastCardOf).filter((past): past is PastCard => past !== null).slice(-HISTORY_MAX)
  : [];
session.viewing =
  typeof session.viewing === "number" && session.viewing >= 0 && session.viewing < session.history.length
    ? session.viewing
    : null;

export function saveSession(): void {
  const { deckId, card, selection, picked, comboOk, recent, dashes, history, viewing } = session;
  saveJson(SESSION_KEY, {
    deckId,
    card,
    selection,
    picked,
    comboOk,
    recent,
    dashes,
    history,
    viewing,
  } satisfies StoredSession);
}

// The Stats tab's Cards buttons land here: the next mount of the Cards
// tab deals a fresh card from `deckId`.
export function resetSessionForDeck(deckId: string): void {
  session.deckId = deckId;
  session.card = null;
  session.next = null;
  session.selection = [];
  session.picked = null;
  session.comboOk = null;
  session.viewing = null;
  session.undo = null;
  saveSession();
}
