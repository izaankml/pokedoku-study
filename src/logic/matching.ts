import { POKEMON } from "../data/pokedex.ts";
import { EXCLUSIVE_GROUPS, QUIZ_CATEGORIES, considersEvolutionLine, getCategory } from "../data/categories.ts";
import type { Category } from "../data/categories.ts";
import type { Pokemon } from "../data/types.ts";

// Narrows which Pokémon may be picked or suggested; null means everyone.
export type PokemonFilter = ((pokemon: Pokemon) => boolean) | null;

const membersCache = new Map<string, Pokemon[]>();
const intersectionCache = new Map<string, Pokemon[]>();

export function membersOf(catId: string): Pokemon[] {
  let members = membersCache.get(catId);
  if (!members) {
    members = POKEMON.filter(getCategory(catId).predicate);
    membersCache.set(catId, members);
  }
  return members;
}

export function intersection(catA: string, catB: string): Pokemon[] {
  const key = pairKey(catA, catB);
  let members = intersectionCache.get(key);
  if (!members) {
    const predicateB = getCategory(catB).predicate;
    members = membersOf(catA).filter(predicateB);
    intersectionCache.set(key, members);
  }
  return members;
}

export function pairIsValid(catA: string, catB: string, min = 1): boolean {
  if (catA === catB) return false;
  const a = getCategory(catA);
  const b = getCategory(catB);
  if (a.group === b.group && EXCLUSIVE_GROUPS.has(a.group)) return false;
  return intersection(catA, catB).length >= min;
}

// Everyone matching every category — Browse with up to three filters.
// One and two ids reuse the pair caches; more get their own.
const intersectAllCache = new Map<string, Pokemon[]>();
export function intersectAll(catIds: string[]): Pokemon[] {
  const ids = [...catIds].sort();
  if (ids.length === 0) return POKEMON;
  if (ids.length === 1) return membersOf(ids[0]);
  if (ids.length === 2) return intersection(ids[0], ids[1]);
  const key = ids.join("|");
  let members = intersectAllCache.get(key);
  if (!members) {
    const restPredicates = ids.slice(2).map((id) => getCategory(id).predicate);
    members = intersection(ids[0], ids[1]).filter((pokemon) => restPredicates.every((predicate) => predicate(pokemon)));
    intersectAllCache.set(key, members);
  }
  return members;
}

// A PokeDoku board names six distinct categories, so a Pokémon valid in
// all nine of its cells matches all six. This is the most any board can
// have: the largest intersection of six categories from the pool. It
// comes from the dataset, so it moves with it when new games add
// Pokémon or PokeDoku adds categories. The pick-stats harvest uses it to
// tell a category board from an everything-goes pool.
const BOARD_CATEGORY_COUNT = 6;

export function maxValidInEveryCell(pool: Category[] = QUIZ_CATEGORIES): number {
  const words = Math.ceil(POKEMON.length / 32);
  // one bit per answer; biggest categories first so a strong bound is
  // found early and most of the search prunes away
  const bitsets = pool
    .map((category) => {
      const bits = new Uint32Array(words);
      POKEMON.forEach((pokemon, at) => {
        if (category.predicate(pokemon)) bits[at >> 5] |= 1 << (at & 31);
      });
      return bits;
    })
    .sort((a, b) => popcount(b) - popcount(a));
  let best = 0;
  const search = (from: number, depth: number, current: Uint32Array): void => {
    if (depth === BOARD_CATEGORY_COUNT) {
      best = Math.max(best, popcount(current));
      return;
    }
    for (let index = from; index <= bitsets.length - (BOARD_CATEGORY_COUNT - depth); index++) {
      const next = current.map((word, at) => word & bitsets[index][at]);
      // intersections only shrink: nothing at or below the best so far can win
      if (popcount(next) <= best) continue;
      search(index + 1, depth + 1, next);
    }
  };
  for (let first = 0; first <= bitsets.length - BOARD_CATEGORY_COUNT; first++) {
    search(first + 1, 1, bitsets[first]);
  }
  return best;
}

function popcount(bits: Uint32Array): number {
  let count = 0;
  for (let word of bits) {
    word -= (word >>> 1) & 0x55555555;
    word = (word & 0x33333333) + ((word >>> 2) & 0x33333333);
    count += Math.imul((word + (word >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
  }
  return count;
}

// Whether `candidate` can be added to the picked categories: not a
// repeat, and someone still matches them all. Existence-only — the
// pairwise checks are cached, and the three-way case stops at the first
// match instead of materializing (and caching) the whole member list.
export function canJoin(catIds: string[], candidate: string): boolean {
  if (catIds.includes(candidate)) return false;
  const others = catIds.filter(Boolean);
  if (!others.length) return true;
  // pairIsValid also rules out exclusive-group clashes
  if (others.some((id) => !pairIsValid(id, candidate))) return false;
  if (others.length === 1) return true;
  const [firstId, ...restIds] = others;
  const restPredicates = [...restIds, candidate].map((id) => getCategory(id).predicate);
  return membersOf(firstId).some((pokemon) => restPredicates.every((predicate) => predicate(pokemon)));
}

export const pairKey = (catA: string, catB: string): string =>
  catA < catB ? `${catA}|${catB}` : `${catB}|${catA}`;

export function normalizeName(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u2640/g, "f")
    .replace(/\u2642/g, "m")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// The words of a name, each normalised, in sorted order — "Charizard
// Mega X", "Mega Charizard X" and "X Mega Charizard" give one list
const wordsOf = (text: string): string[] =>
  text
    .split(/[\s\-–—()/]+/)
    .map(normalizeName)
    .filter(Boolean)
    .sort();

// Those words as one key
export const wordBag = (text: string): string => wordsOf(text).join(" ");

// Every naming a Pokémon goes by: PokeDoku's ("Floette Eternal"), the
// dataset's ("Floette (Eternal)", "Alolan Raichu") and the species with
// the form's own words ("Tauros Paldea Combat")
function namingsOf(pokemon: Pokemon): string[] {
  const names = [pokemon.displayName];
  if (pokemon.altName) names.push(pokemon.altName);
  if (pokemon.form) names.push(`${pokemon.speciesName} ${pokemon.form}`);
  return names;
}

interface SearchName {
  norm: string;
  // where the species name starts in `norm`
  speciesAt: number;
}

interface SearchEntry {
  species: string;
  // the species name's words, normalised and sorted
  speciesWords: string[];
  norms: SearchName[];
  // each naming's words, normalised and sorted (see BAG_TO_POKEMON)
  namings: string[][];
  pokemon: Pokemon;
}

// Each Pokémon is searchable by its display name ("Growlithe Hisui", as
// PokeDoku names it), the dataset's own name ("Hisuian Growlithe") and,
// for forms, the dex slug too ("growlithehisui"). A match has to reach the
// species name, though: "venusaur" or "venusaur m" finds Venusaur Mega,
// but "mega", "galar" or "dusk" (for Lycanroc Dusk) on their own find
// nothing by their form word — `speciesAt` is where the species starts in
// each name, so a prefix match must run past it.
const SEARCH_INDEX: SearchEntry[] = POKEMON.map((pokemon) => {
  const species = normalizeName(pokemon.speciesName || pokemon.displayName);
  const names = [normalizeName(pokemon.displayName)];
  if (pokemon.altName) names.push(normalizeName(pokemon.altName));
  if (pokemon.form && !names.includes(pokemon.name)) names.push(pokemon.name);
  const norms = names.map((norm) => ({ norm, speciesAt: Math.max(0, norm.indexOf(species)) }));
  const namings: string[][] = [];
  for (const naming of namingsOf(pokemon)) {
    const words = wordsOf(naming);
    if (!namings.some((kept) => kept.join(" ") === words.join(" "))) namings.push(words);
  }
  return { species, speciesWords: wordsOf(pokemon.speciesName || pokemon.displayName), norms, namings, pokemon };
});

const NORM_TO_POKEMON = new Map<string, Pokemon>();
for (const { norms, pokemon } of SEARCH_INDEX) {
  for (const { norm } of norms) NORM_TO_POKEMON.set(norm, pokemon);
}

// Every naming as a bag of words. No two Pokémon share a bag
// (matching.test.ts checks), so a name typed with its words in another
// order — "Eternal Floette", "Charizard Gigantamax" — still lands on
// exactly one.
const BAG_TO_POKEMON = new Map<string, Pokemon>();
for (const { namings, pokemon } of SEARCH_INDEX) {
  for (const words of namings) {
    const bag = words.join(" ");
    if (!BAG_TO_POKEMON.has(bag)) BAG_TO_POKEMON.set(bag, pokemon);
  }
}

// The Pokémon a name is: spelt exactly (any of its namings, punctuation
// and case aside), or with the words in another order. Never a near miss:
// "Charizrd" is nobody. `eligible`, when given, keeps only the Pokémon it
// accepts.
export function findByName(query: string, eligible: PokemonFilter = null): Pokemon | null {
  const pokemon = NORM_TO_POKEMON.get(normalizeName(query)) ?? BAG_TO_POKEMON.get(wordBag(query)) ?? null;
  return pokemon && (!eligible || eligible(pokemon)) ? pokemon : null;
}

// Whether a name says which species a form is, but not which form —
// "Charizard" or "Mega Charizard" for Charizard Mega X, "Tauros Paldea"
// for the Combat Breed: every word typed is in one of the Pokémon's
// namings, the species' own words are all there, and some of the
// naming's are missing. Never for a Pokémon that has no form to leave
// out ("Koko" for Tapu Koko is just nobody).
export function namesSpeciesOnly(query: string, pokemon: Pokemon): boolean {
  if (pokemon.form === null) return false;
  const typed = new Set(wordsOf(query));
  if (!typed.size) return false;
  if (!wordsOf(pokemon.speciesName || pokemon.displayName).every((word) => typed.has(word))) return false;
  return namingsOf(pokemon).some((naming) => {
    const full = new Set(wordsOf(naming));
    return typed.size < full.size && [...typed].every((word) => full.has(word));
  });
}

// Which stretch of `text` a query is measured against
type Stretch = "anywhere" | "prefix" | "whole";

// The fewest edits (insert, delete, substitute, swap two neighbours) that
// turn `query` into some stretch of `text` — anywhere in it, a prefix of
// it, or the whole of it. Stops early, returning Infinity, once no
// stretch can come within `maxEdits`.
function editsToMatch(query: string, text: string, maxEdits: number, stretch: Stretch): number {
  if (stretch === "whole" && Math.abs(query.length - text.length) > maxEdits) return Infinity;
  const width = text.length + 1;
  let previousRow: number[] = new Array<number>(width);
  let twoRowsBack: number[] | null = null;
  for (let column = 0; column < width; column++) previousRow[column] = stretch === "anywhere" ? 0 : column;
  for (let row = 1; row <= query.length; row++) {
    const currentRow: number[] = new Array<number>(width);
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
        twoRowsBack &&
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
  if (stretch === "whole") return previousRow[width - 1];
  let best = Infinity;
  for (let column = 1; column < width; column++) best = Math.min(best, previousRow[column]);
  return best;
}

// How many typos a query of this length may carry: none under five
// letters, one from five, two from eight, three from twelve — "vensaur"
// gets one, "pikachoo" and "dusknior" two, "typhlosoin" two.
const typoAllowance = (query: string): number =>
  query.length < 5 ? 0 : Math.min(3, Math.floor(query.length / 4));

// The edits that turn the words typed into some of a naming's words, each
// typed word its own word of the naming within its own typo allowance,
// with the species' words all reached — or Infinity. Word by word, so a
// budget for a long name is never spent on a word that is nobody's
// ("Charizard blah" is no slip on Charizard Gmax), and a form word may
// go unsaid ("Mega Charizrd" is a slip on Charizard Mega X: species
// first, form next).
function editsToWords(typed: string[], naming: string[], speciesWords: string[]): number {
  if (typed.length > naming.length) return Infinity;
  const used = new Set<number>();
  let edits = 0;
  for (const word of typed) {
    const maxEdits = typoAllowance(word);
    let bestAt = -1;
    let bestEdits = Infinity;
    naming.forEach((candidate, at) => {
      if (used.has(at)) return;
      const cost = editsToMatch(word, candidate, maxEdits, "whole");
      if (cost < bestEdits) {
        bestEdits = cost;
        bestAt = at;
      }
    });
    if (bestAt < 0) return Infinity;
    used.add(bestAt);
    edits += bestEdits;
  }
  const reached = [...used].map((at) => naming[at]);
  return speciesWords.every((word) => reached.includes(word)) ? edits : Infinity;
}

// The Pokémon a name is a misspelling of: its species name run together
// ("tapukokko"), or each word typed a slip on a word of one of its
// namings ("Charizrd", "X Mega Charizrd", "Alolan Raichuu"), the species
// always among them. The nearest, when several are close. Never a name
// spelt right (that's someone, see findByName), nor one that is only the
// start of a name ("Chariz") — that's short of a name, not a slip in one.
export function nearMiss(query: string, eligible: PokemonFilter = null): Pokemon | null {
  const typed = wordsOf(query);
  if (!typed.length) return null;
  const runTogether = typed.length === 1 ? typed[0] : null;
  let best: { edits: number; pokemon: Pokemon } | null = null;
  for (const { species, speciesWords, namings, pokemon } of SEARCH_INDEX) {
    if (eligible && !eligible(pokemon)) continue;
    let edits = Infinity;
    if (runTogether !== null && speciesWords.length > 1) {
      edits = editsToMatch(runTogether, species, typoAllowance(runTogether), "whole");
    }
    for (const naming of namings) edits = Math.min(edits, editsToWords(typed, naming, speciesWords));
    if (edits === 0) return null;
    if (edits < Infinity && (!best || edits < best.edits)) best = { edits, pokemon };
  }
  return best?.pokemon ?? null;
}

// Exact hits first (prefix, then substring of the species), then, only
// while the list has room, near-misses ordered by how far off they are.
export function searchNames(query: string, limit = 8, eligible: PokemonFilter = null): Pokemon[] {
  const normalized = normalizeName(query);
  if (!normalized) return [];
  const starts: Pokemon[] = [];
  const contains: Pokemon[] = [];
  const candidates: SearchEntry[] = [];
  for (const entry of SEARCH_INDEX) {
    const { species, norms, pokemon } = entry;
    if (eligible && !eligible(pokemon)) continue;
    if (
      species.startsWith(normalized) ||
      norms.some(({ norm, speciesAt }) => normalized.length > speciesAt && norm.startsWith(normalized))
    ) {
      starts.push(pokemon);
    } else if (species.includes(normalized)) {
      contains.push(pokemon);
    } else {
      candidates.push(entry);
    }
  }
  const exact = starts.concat(contains);
  const maxEdits = typoAllowance(normalized);
  if (exact.length >= limit || maxEdits === 0) return exact.slice(0, limit);

  // Near-misses are judged on the species name alone, or on the names that
  // open with it ("Lycanroc Dusk", "lycanrocdusk") — a typo budget must
  // never be spent on a form-first name's form word ("Mega Chimecho").
  const fuzzy: { edits: number; pokemon: Pokemon }[] = [];
  for (const { species, norms, pokemon } of candidates) {
    let edits = editsToMatch(normalized, species, maxEdits, "anywhere");
    for (const { norm, speciesAt } of norms) {
      if (edits === 0) break;
      if (speciesAt === 0) edits = Math.min(edits, editsToMatch(normalized, norm, maxEdits, "prefix"));
    }
    if (edits <= maxEdits) fuzzy.push({ edits, pokemon });
  }
  fuzzy.sort((a, b) => a.edits - b.edits);
  return exact.concat(fuzzy.map((match) => match.pokemon)).slice(0, limit);
}

// Mega and Gigantamax forms sit outside every evolution line, so a
// question or cell that considers the line never has them as answers:
// don't offer them as guesses there.
const isMegaOrGmax = (pokemon: Pokemon): boolean =>
  pokemon.flags.includes("mega") || pokemon.flags.includes("gmax");
export function guessFilterFor(catIds: string[]): PokemonFilter {
  return catIds.some(considersEvolutionLine) ? (pokemon) => !isMegaOrGmax(pokemon) : null;
}

// Every valid category pair, as [catA, catB] with catA.id < catB.id.
// Cached per category list — by ARRAY IDENTITY, so pass a module-level
// list (QUIZ_CATEGORIES, CATEGORIES); an inline .filter() would miss the
// cache every call. Used for drill selection and schedule summaries.
export type CategoryPair = [Category, Category];
const validPairsCache = new WeakMap<Category[], CategoryPair[]>();

export function allValidPairs(categories: Category[]): CategoryPair[] {
  let pairs = validPairsCache.get(categories);
  if (!pairs) {
    pairs = [];
    for (let i = 0; i < categories.length; i++) {
      for (let j = i + 1; j < categories.length; j++) {
        const a = categories[i];
        const b = categories[j];
        if (pairIsValid(a.id, b.id, 1)) pairs.push(a.id < b.id ? [a, b] : [b, a]);
      }
    }
    validPairsCache.set(categories, pairs);
  }
  return pairs;
}
