import { QUIZ_CATEGORIES } from "../data/categories.ts";
import type { Category } from "../data/categories.ts";
import type { Pokemon } from "../data/types.ts";
import { DECKS, DECK_BY_ID, cardKey, deckPool, filterFor, filteredDeckPool } from "./flashcards.ts";
import type { Deck, DeckFilters } from "./flashcards.ts";
import { allValidPairs, pairKey } from "./matching.ts";
import type { CategoryPair } from "./matching.ts";
import { dueFactor } from "./schedule.ts";
import { smoothedAccuracy } from "./stats.ts";
import type { MergedStats } from "./stats.ts";

// A source of numbers in [0, 1); tests pass a seeded one.
export type RandomSource = () => number;

// Weight grows as accuracy falls; priorWeight biases toward known weak
// spots (Gen 5+ regions etc.) until real history takes over.
export function categoryWeight(category: Category, merged: MergedStats): number {
  return category.priorWeight * (1.25 - smoothedAccuracy(merged.categories[category.id]));
}

export function pickWeighted<T>(items: T[], weightFn: (item: T) => number, random: RandomSource = Math.random): T {
  const weights = items.map((item) => Math.max(weightFn(item), 0.001));
  let roll = random() * weights.reduce((sum, weight) => sum + weight, 0);
  for (let index = 0; index < items.length; index++) {
    roll -= weights[index];
    if (roll <= 0) return items[index];
  }
  return items[items.length - 1];
}

// catId -> valid partner categories, built once from allValidPairs.
let partnersCache: Map<string, Category[]> | null = null;
function partnersOf(catId: string): Category[] {
  if (!partnersCache) {
    const cache = new Map<string, Category[]>(QUIZ_CATEGORIES.map((category) => [category.id, []]));
    for (const [a, b] of allValidPairs(QUIZ_CATEGORIES)) {
      cache.get(a.id)?.push(b);
      cache.get(b.id)?.push(a);
    }
    partnersCache = cache;
  }
  return partnersCache.get(catId) || [];
}

export interface PickDrillPairOptions {
  // pair keys (matching.ts pairKey) not to ask again right away
  avoid?: Set<string> | null;
  random?: RandomSource;
  now?: number;
}

// Two-step pick: a category (weighted by weakness and by how due its
// pairs are on average), then a partner (weighted by weakness and by how
// due that specific pair is). Recently answered pairs fade out; overdue
// ones come back.
export function pickDrillPair(
  merged: MergedStats,
  { avoid = null, random = Math.random, now = Date.now() }: PickDrillPairOptions = {},
): CategoryPair {
  const pairDue = (a: Category, b: Category): number => dueFactor(merged.pairs[pairKey(a.id, b.id)], now);
  const meanDue = (category: Category): number => {
    const partners = partnersOf(category.id);
    if (!partners.length) return 0;
    let sum = 0;
    for (const partner of partners) sum += pairDue(category, partner);
    return sum / partners.length;
  };
  for (let attempt = 0; attempt < 50; attempt++) {
    const first = pickWeighted(QUIZ_CATEGORIES, (category) => categoryWeight(category, merged) * meanDue(category), random);
    const partners = partnersOf(first.id);
    if (!partners.length) continue;
    const second = pickWeighted(
      partners,
      (category) => categoryWeight(category, merged) * pairDue(first, category),
      random,
    );
    if (avoid && avoid.has(pairKey(first.id, second.id))) continue;
    return [first, second];
  }
  // practically unreachable (every category has at least one valid partner,
  // and `avoid` holds one pair): any valid pair will do
  return allValidPairs(QUIZ_CATEGORIES)[0];
}

export interface PickFlashcardOptions {
  // a deck id, or "all" for any deck
  deckId?: string;
  // Pokémon ids not to pick (the last few cards)
  exclude?: Set<number>;
  // the user's per-deck filters (flashcards.ts DeckFilters)
  filters?: DeckFilters;
  random?: RandomSource;
  now?: number;
}

export interface FlashcardPick {
  deck: Deck;
  pokemon: Pokemon;
  // what the deck asks about on this card (a move id), when it asks about one thing
  param: string | null;
}

// Picks a flashcard: a deck (all decks, or the one asked for) and a Pokémon
// from that deck's pool, weighted by weakness, how due it is, and the deck's
// own bias; decks that ask about one specific thing per card (Moves) also
// pick that.
export function pickFlashcard(
  merged: MergedStats,
  { deckId = "all", exclude = new Set<number>(), filters = {}, random = Math.random, now = Date.now() }: PickFlashcardOptions = {},
): FlashcardPick {
  const decks = deckId === "all" ? DECKS : [deckById(deckId)];
  const chosenFor = new Map(decks.map((deck) => [deck.id, filterFor(filters, deck.id)]));
  // Per deck: prefer the filtered pool without the recent cards; a filter
  // narrow enough to exhaust it drops the recent-exclusion first and the
  // filter only as a last resort — and each deck falls back on its own,
  // so a tight filter never silently removes a deck from the All mix.
  const cards = decks.flatMap((deck) => {
    const pool = deckPool(deck);
    const filteredPool = filteredDeckPool(deck, chosenFor.get(deck.id) ?? null);
    let members = filteredPool.filter((pokemon) => !exclude.has(pokemon.id));
    if (!members.length) members = filteredPool;
    if (!members.length) members = pool.filter((pokemon) => !exclude.has(pokemon.id));
    if (!members.length) members = pool;
    return members.map((pokemon) => ({ deck, pokemon }));
  });
  const pick = pickWeighted(
    cards,
    ({ deck, pokemon }) => {
      const entry = merged.flashcards[cardKey(deck, pokemon)];
      return deck.bias(pokemon) * (1.25 - smoothedAccuracy(entry)) * dueFactor(entry, now);
    },
    random,
  );
  const param = pick.deck.pickParam ? pick.deck.pickParam(pick.pokemon, random, chosenFor.get(pick.deck.id)) : null;
  return { ...pick, param };
}

function deckById(deckId: string): Deck {
  const deck = DECK_BY_ID.get(deckId);
  if (!deck) throw new Error(`unknown deck: ${deckId}`);
  return deck;
}

// Region deck only — kept for tests and callers that predate decks.
export function pickFlashcardPokemon(merged: MergedStats, options: Omit<PickFlashcardOptions, "deckId"> = {}): Pokemon {
  return pickFlashcard(merged, { ...options, deckId: "region" }).pokemon;
}
