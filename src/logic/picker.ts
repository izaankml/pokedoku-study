import { CATEGORIES } from "../data/categories.ts";
import type { Category } from "../data/categories.ts";
import type { Pokemon } from "../data/types.ts";
import { DECKS, DECK_BY_ID, cardKey, deckPool } from "./flashcards.ts";
import type { Deck } from "./flashcards.ts";
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
    const cache = new Map<string, Category[]>(CATEGORIES.map((category) => [category.id, []]));
    for (const [a, b] of allValidPairs(CATEGORIES)) {
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
    const a = pickWeighted(CATEGORIES, (category) => categoryWeight(category, merged) * meanDue(category), random);
    const partners = partnersOf(a.id);
    if (!partners.length) continue;
    const b = pickWeighted(
      partners,
      (category) => categoryWeight(category, merged) * pairDue(a, category),
      random,
    );
    if (avoid && avoid.has(pairKey(a.id, b.id))) continue;
    return [a, b];
  }
  // practically unreachable (every category has at least one valid partner,
  // and `avoid` holds one pair): any valid pair will do
  return allValidPairs(CATEGORIES)[0];
}

export interface PickFlashcardOptions {
  // a deck id, or "all" for any deck
  deckId?: string;
  // Pokémon ids not to pick (the last few cards)
  exclude?: Set<number>;
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
  { deckId = "all", exclude = new Set<number>(), random = Math.random, now = Date.now() }: PickFlashcardOptions = {},
): FlashcardPick {
  const decks = deckId === "all" ? DECKS : [deckById(deckId)];
  const cards = decks.flatMap((deck) =>
    deckPool(deck)
      .filter((pokemon) => !exclude.has(pokemon.id))
      .map((pokemon) => ({ deck, pokemon })),
  );
  const pick = pickWeighted(
    cards,
    ({ deck, pokemon }) => {
      const entry = merged.flashcards[cardKey(deck, pokemon)];
      return deck.bias(pokemon) * (1.25 - smoothedAccuracy(entry)) * dueFactor(entry, now);
    },
    random,
  );
  const param = pick.deck.pickParam ? pick.deck.pickParam(pick.pokemon, random) : null;
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
