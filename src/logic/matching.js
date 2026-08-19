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

// The fewest edits (insert, delete, substitute, swap two neighbours) that
// turn `query` into some stretch of `text` — a prefix of it when
// `anchored`, anywhere in it otherwise. Stops early, returning Infinity,
// once no stretch can come within `maxEdits`.
function editsToMatch(query, text, maxEdits, anchored) {
  const width = text.length + 1;
  let previousRow = new Array(width);
  let twoRowsBack = null;
  for (let column = 0; column < width; column++) previousRow[column] = anchored ? column : 0;
  let best = Infinity;
  for (let row = 1; row <= query.length; row++) {
    const currentRow = new Array(width);
    currentRow[0] = row;
    let rowMin = row;
    for (let column = 1; column < width; column++) {
      const same = query[row - 1] === text[column - 1];
      let cost = Math.min(
        previousRow[column] + 1,
        currentRow[column - 1] + 1,
        previousRow[column - 1] + (same ? 0 : 1),
      );
      if (
        row > 1 && column > 1 &&
        query[row - 1] === text[column - 2] && query[row - 2] === text[column - 1]
      ) {
        cost = Math.min(cost, twoRowsBack[column - 2] + 1);
      }
      currentRow[column] = cost;
      if (cost < rowMin) rowMin = cost;
    }
    if (rowMin > maxEdits) return Infinity;
    twoRowsBack = previousRow;
    previousRow = currentRow;
  }
  for (let column = 1; column < width; column++) best = Math.min(best, previousRow[column]);
  return best;
}

// How many typos a query of this length may carry: none under five
// letters, one from five, two from eight, three from twelve — "vensaur"
// gets one, "pikachoo" and "dusknior" two, "typhlosoin" two.
const typoAllowance = (q) => (q.length < 5 ? 0 : Math.min(3, Math.floor(q.length / 4)));

// Exact hits first (prefix, then substring of the species), then, only
// while the list has room, near-misses ordered by how far off they are.
export function searchNames(query, limit = 8, eligible = null) {
  const q = normalizeName(query);
  if (!q) return [];
  const starts = [];
  const contains = [];
  const candidates = [];
  for (const entry of SEARCH_INDEX) {
    const { species, norms, pokemon } = entry;
    if (eligible && !eligible(pokemon)) continue;
    if (species.startsWith(q) || norms.some(({ norm, speciesAt }) => q.length > speciesAt && norm.startsWith(q))) {
      starts.push(pokemon);
    } else if (species.includes(q)) {
      contains.push(pokemon);
    } else {
      candidates.push(entry);
    }
  }
  const exact = starts.concat(contains);
  const maxEdits = typoAllowance(q);
  if (exact.length >= limit || maxEdits === 0) return exact.slice(0, limit);

  // Near-misses are judged on the species name alone, or on the names that
  // open with it ("Lycanroc Dusk", "lycanrocdusk") — a typo budget must
  // never be spent on a form-first name's form word ("Mega Chimecho").
  const fuzzy = [];
  for (const { species, norms, pokemon } of candidates) {
    let edits = editsToMatch(q, species, maxEdits, false);
    for (const { norm, speciesAt } of norms) {
      if (edits === 0) break;
      if (speciesAt === 0) edits = Math.min(edits, editsToMatch(q, norm, maxEdits, true));
    }
    if (edits <= maxEdits) fuzzy.push({ edits, pokemon });
  }
  fuzzy.sort((a, b) => a.edits - b.edits);
  return exact.concat(fuzzy.map((f) => f.pokemon)).slice(0, limit);
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
