import { CATEGORIES } from "../data/categories.js";
import { POKEMON } from "../data/pokedex.js";
import { allValidPairs, pairKey } from "./matching.js";
import { dueFactor } from "./schedule.js";
import { smoothedAccuracy } from "./stats.js";

// Weight grows as accuracy falls; priorWeight biases toward known weak
// spots (Gen 5+ regions etc.) until real history takes over.
export function categoryWeight(cat, merged) {
  return cat.priorWeight * (1.25 - smoothedAccuracy(merged.categories[cat.id]));
}

export function pickWeighted(items, weightFn, random = Math.random) {
  const weights = items.map((item) => Math.max(weightFn(item), 0.001));
  let roll = random() * weights.reduce((sum, w) => sum + w, 0);
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}

// catId -> valid partner categories, built once from allValidPairs.
let partnersCache = null;
function partnersOf(catId) {
  if (!partnersCache) {
    partnersCache = new Map(CATEGORIES.map((c) => [c.id, []]));
    for (const [a, b] of allValidPairs(CATEGORIES)) {
      partnersCache.get(a.id).push(b);
      partnersCache.get(b.id).push(a);
    }
  }
  return partnersCache.get(catId) || [];
}

// Two-step pick: a category (weighted by weakness and by how due its
// pairs are on average), then a partner (weighted by weakness and by how
// due that specific pair is). Recently answered pairs fade out; overdue
// ones come back.
export function pickDrillPair(
  merged,
  { avoid = null, random = Math.random, now = Date.now() } = {}
) {
  const pairDue = (a, b) => dueFactor(merged.pairs[pairKey(a.id, b.id)], now);
  const meanDue = (cat) => {
    const partners = partnersOf(cat.id);
    if (!partners.length) return 0;
    let sum = 0;
    for (const p of partners) sum += pairDue(cat, p);
    return sum / partners.length;
  };
  for (let attempt = 0; attempt < 50; attempt++) {
    const a = pickWeighted(CATEGORIES, (c) => categoryWeight(c, merged) * meanDue(c), random);
    const partners = partnersOf(a.id);
    if (!partners.length) continue;
    const b = pickWeighted(
      partners,
      (c) => categoryWeight(c, merged) * pairDue(a, c),
      random
    );
    if (avoid && avoid.has(pairKey(a.id, b.id))) continue;
    return [a, b];
  }
  // practically unreachable; every category has at least one valid partner
  return null;
}

export function pickFlashcardPokemon(
  merged,
  { exclude = new Set(), random = Math.random, now = Date.now() } = {}
) {
  const pool = POKEMON.filter((p) => !exclude.has(p.id));
  return pickWeighted(
    pool,
    (p) => {
      const entry = merged.flashcards[String(p.id)];
      return (
        (p.gen >= 5 ? 2 : 1) *
        (1.25 - smoothedAccuracy(entry)) *
        dueFactor(entry, now)
      );
    },
    random
  );
}
