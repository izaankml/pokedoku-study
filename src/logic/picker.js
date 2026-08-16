import { CATEGORIES } from "../data/categories.js";
import { POKEMON } from "../data/pokedex.js";
import { pairIsValid, pairKey } from "./matching.js";
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

export function pickDrillPair(merged, { avoid = null, random = Math.random } = {}) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const a = pickWeighted(CATEGORIES, (c) => categoryWeight(c, merged), random);
    const partners = CATEGORIES.filter((c) => pairIsValid(a.id, c.id, 1));
    if (!partners.length) continue;
    const b = pickWeighted(partners, (c) => categoryWeight(c, merged), random);
    if (avoid && avoid.has(pairKey(a.id, b.id))) continue;
    return [a, b];
  }
  // practically unreachable; every category has at least one valid partner
  return null;
}

export function pickFlashcardPokemon(merged, { exclude = new Set(), random = Math.random } = {}) {
  const pool = POKEMON.filter((p) => !exclude.has(p.id));
  return pickWeighted(
    pool,
    (p) =>
      (p.gen >= 5 ? 2 : 1) *
      (1.25 - smoothedAccuracy(merged.flashcards[String(p.id)])),
    random
  );
}
