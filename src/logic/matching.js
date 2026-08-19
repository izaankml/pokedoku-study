import { POKEMON } from "../data/pokedex.js";
import { EXCLUSIVE_GROUPS, considersEvolutionLine, getCategory } from "../data/categories.js";

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

export function pairIsValid(catA, catB, min = 1) {
  if (catA === catB) return false;
  const a = getCategory(catA);
  const b = getCategory(catB);
  if (a.group === b.group && EXCLUSIVE_GROUPS.has(a.group)) return false;
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

// Each Pokémon is searchable by its display name ("Growlithe Hisui", as
// PokeDoku names it), the dataset's own name ("Hisuian Growlithe") and,
// for forms, the dex slug too ("growlithehisui"). A match has to reach the
// species name, though: "venusaur" or "venusaur m" finds Venusaur Mega,
// but "mega", "galar" or "dusk" (for Lycanroc Dusk) on their own find
// nothing by their form word — `speciesAt` is where the species starts in
// each name, so a prefix match must run past it.
const SEARCH_INDEX = POKEMON.map((p) => {
  const species = normalizeName(p.speciesName || p.displayName);
  const names = [normalizeName(p.displayName)];
  if (p.altName) names.push(normalizeName(p.altName));
  if (p.form && !names.includes(p.name)) names.push(p.name);
  const norms = names.map((norm) => ({ norm, speciesAt: Math.max(0, norm.indexOf(species)) }));
  return { species, norms, pokemon: p };
});

const NORM_TO_POKEMON = new Map();
for (const { norms, pokemon } of SEARCH_INDEX) {
  for (const { norm } of norms) NORM_TO_POKEMON.set(norm, pokemon);
}

// `eligible`, when given, keeps only the Pokémon it accepts.
export function findByName(query, eligible = null) {
  const p = NORM_TO_POKEMON.get(normalizeName(query)) || null;
  return p && (!eligible || eligible(p)) ? p : null;
}

export function searchNames(query, limit = 8, eligible = null) {
  const q = normalizeName(query);
  if (!q) return [];
  const starts = [];
  const contains = [];
  for (const { species, norms, pokemon } of SEARCH_INDEX) {
    if (eligible && !eligible(pokemon)) continue;
    if (species.startsWith(q) || norms.some(({ norm, speciesAt }) => q.length > speciesAt && norm.startsWith(q))) {
      starts.push(pokemon);
    } else if (species.includes(q)) {
      contains.push(pokemon);
    }
  }
  return starts.concat(contains).slice(0, limit);
}

// Every valid category pair, as [catA, catB] with catA.id < catB.id.
// Computed once; used for drill selection and schedule summaries.
let validPairsCache = null;
// Mega and Gigantamax forms sit outside every evolution line, so a
// question or cell that considers the line never has them as answers:
// don't offer them as guesses there.
const isMegaOrGmax = (p) => p.flags.includes("mega") || p.flags.includes("gmax");
export function guessFilterFor(catIds) {
  return catIds.some(considersEvolutionLine) ? (p) => !isMegaOrGmax(p) : null;
}

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
