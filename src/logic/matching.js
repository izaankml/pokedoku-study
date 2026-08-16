import { POKEMON } from "../data/pokedex.js";
import { getCategory } from "../data/categories.js";

const membersCache = new Map();
const intersectionCache = new Map();

export function membersOf(catId) {
  if (!membersCache.has(catId)) {
    membersCache.set(catId, POKEMON.filter(getCategory(catId).predicate));
  }
  return membersCache.get(catId);
}

export function intersection(catA, catB) {
  const key = catA < catB ? `${catA}|${catB}` : `${catB}|${catA}`;
  if (!intersectionCache.has(key)) {
    const b = getCategory(catB).predicate;
    intersectionCache.set(key, membersOf(catA).filter(b));
  }
  return intersectionCache.get(key);
}

// Same-group pairs are structurally empty (a Pokémon has one stage, one
// type count) — except types (a pair means a dual type), special flags, and
// regions (a few forms count for two regions).
const SAME_GROUP_OK = new Set(["type", "special", "region"]);
export function pairIsValid(catA, catB, min = 1) {
  if (catA === catB) return false;
  const a = getCategory(catA);
  const b = getCategory(catB);
  if (a.group === b.group && !SAME_GROUP_OK.has(a.group)) return false;
  return intersection(catA, catB).length >= min;
}

export const pairKey = (catA, catB) =>
  catA < catB ? `${catA}|${catB}` : `${catB}|${catA}`;

export function normalizeName(s) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u2640/g, "f")
    .replace(/\u2642/g, "m")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Each Pokémon is searchable by its display name and, for forms, by the
// dex slug too ("Hisuian Growlithe" / "growlithe hisui", "Mega Charizard X"
// / "charizard mega x").
const SEARCH_INDEX = POKEMON.map((p) => {
  const norms = [normalizeName(p.displayName)];
  if (p.form && p.name !== norms[0]) norms.push(p.name);
  return { norms, pokemon: p };
});

const NORM_TO_POKEMON = new Map();
for (const { norms, pokemon } of SEARCH_INDEX) {
  for (const norm of norms) NORM_TO_POKEMON.set(norm, pokemon);
}

export function findByName(query) {
  return NORM_TO_POKEMON.get(normalizeName(query)) || null;
}

export function searchNames(query, limit = 8) {
  const q = normalizeName(query);
  if (!q) return [];
  const starts = [];
  const contains = [];
  for (const { norms, pokemon } of SEARCH_INDEX) {
    if (norms.some((n) => n.startsWith(q))) starts.push(pokemon);
    else if (norms.some((n) => n.includes(q))) contains.push(pokemon);
  }
  return starts.concat(contains).slice(0, limit);
}

// Every valid category pair, as [catA, catB] with catA.id < catB.id.
// Computed once; used for drill selection and schedule summaries.
let validPairsCache = null;
export function allValidPairs(categories) {
  if (!validPairsCache) {
    const pairs = [];
    for (let i = 0; i < categories.length; i++) {
      for (let j = i + 1; j < categories.length; j++) {
        const a = categories[i];
        const b = categories[j];
        if (pairIsValid(a.id, b.id, 1)) pairs.push(a.id < b.id ? [a, b] : [b, a]);
      }
    }
    validPairsCache = pairs;
  }
  return validPairsCache;
}
