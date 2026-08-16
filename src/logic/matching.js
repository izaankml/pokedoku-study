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

// Same-group pairs are structurally empty (a Pokémon has one region, one
// stage, one type count) — except types, where a pair means a dual type.
export function pairIsValid(catA, catB, min = 1) {
  if (catA === catB) return false;
  const a = getCategory(catA);
  const b = getCategory(catB);
  if (a.group === b.group && a.group !== "type" && a.group !== "special") {
    return false;
  }
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

const SEARCH_INDEX = POKEMON.map((p) => ({
  norm: normalizeName(p.displayName),
  pokemon: p,
}));

const NORM_TO_POKEMON = new Map(SEARCH_INDEX.map((e) => [e.norm, e.pokemon]));

export function findByName(query) {
  return NORM_TO_POKEMON.get(normalizeName(query)) || null;
}

export function searchNames(query, limit = 8) {
  const q = normalizeName(query);
  if (!q) return [];
  const starts = [];
  const contains = [];
  for (const { norm, pokemon } of SEARCH_INDEX) {
    if (norm.startsWith(q)) starts.push(pokemon);
    else if (norm.includes(q)) contains.push(pokemon);
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
