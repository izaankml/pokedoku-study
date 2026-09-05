import { QUIZ_CATEGORIES, getCategory } from "../data/categories.ts";
import type { Category } from "../data/categories.ts";
import type { Pokemon } from "../data/types.ts";
import { DECKS, cardKey, deckBias, deckPool, focusedDeckPool } from "./flashcards.ts";
import type { CardFilter } from "./flashcards.ts";
import { allValidPairs, pairIsValid, pairKey } from "./matching.ts";
import type { CategoryPair } from "./matching.ts";
import { dueFactor, scheduleStatus } from "./schedule.ts";
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
  // a deck id ("region", "combo:type+region"), or "all" for any single deck
  deckId?: string;
  // Pokémon ids not to pick (the last few cards)
  exclude?: Set<number>;
  // the user's focus filter (flashcards.ts CardFilter)
  filter?: CardFilter;
  random?: RandomSource;
  now?: number;
}

export interface FlashcardPick {
  deckId: string;
  pokemon: Pokemon;
}

// Picks a flashcard: a deck (the one asked for, or any single deck for
// "all") and a Pokémon from that deck's pool. While any card the pool can
// deal is due, the pick is among the due ones; otherwise anyone. Either
// way weighted by weakness, how due it is, and the deck's own bias.
export function pickFlashcard(
  merged: MergedStats,
  { deckId = "all", exclude = new Set<number>(), filter = {}, random = Math.random, now = Date.now() }: PickFlashcardOptions = {},
): FlashcardPick {
  const deckIds = deckId === "all" ? DECKS.map((deck) => deck.id) : [deckId];
  // Per deck: prefer the focused pool without the recent cards; a filter
  // narrow enough to exhaust it drops the recent-exclusion first and the
  // filter only as a last resort. Each deck falls back on its own, so a
  // tight filter never silently removes a deck from the All mix.
  const cards = deckIds.flatMap((id) => {
    const pool = deckPool(id);
    const focused = focusedDeckPool(id, filter);
    let members = focused.filter((pokemon) => !exclude.has(pokemon.id));
    if (!members.length) members = focused;
    if (!members.length) members = pool.filter((pokemon) => !exclude.has(pokemon.id));
    if (!members.length) members = pool;
    return members.map((pokemon) => ({ deckId: id, pokemon }));
  });
  const entryOf = (card: FlashcardPick) => merged.flashcards[cardKey(card.deckId, card.pokemon)];
  const dueCards = cards.filter((card) => scheduleStatus(entryOf(card), now) === "due");
  return pickWeighted(
    dueCards.length ? dueCards : cards,
    (card) => {
      const entry = entryOf(card);
      return deckBias(card.deckId, card.pokemon) * (1.25 - smoothedAccuracy(entry)) * dueFactor(entry, now);
    },
    random,
  );
}

export interface DrillPairForOptions {
  random?: RandomSource;
  now?: number;
}

// A drill pair containing `catId` (the Stats tab's Drill buttons): an
// already-practised partner when one exists, otherwise any partner from
// another group with a non-empty intersection, weighted by weakness and
// how due the pair is either way.
export function drillPairFor(
  catId: string,
  merged: MergedStats,
  { random = Math.random, now = Date.now() }: DrillPairForOptions = {},
): CategoryPair {
  const category = getCategory(catId);
  const partners = QUIZ_CATEGORIES.filter(
    (partner) => partner.group !== category.group && pairIsValid(catId, partner.id),
  );
  if (!partners.length) return pickDrillPair(merged, { random, now });
  const practised = partners.filter((partner) => merged.pairs[pairKey(catId, partner.id)]);
  const pool = practised.length ? practised : partners;
  const partner = pickWeighted(
    pool,
    (candidate) => categoryWeight(candidate, merged) * dueFactor(merged.pairs[pairKey(catId, candidate.id)], now),
    random,
  );
  return [category, partner];
}
