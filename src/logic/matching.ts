import { POKEMON } from "../data/pokedex.ts";
import { EXCLUSIVE_GROUPS, considersEvolutionLine, getCategory } from "../data/categories.ts";
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

interface SearchName {
  norm: string;
  // where the species name starts in `norm`
  speciesAt: number;
}

interface SearchEntry {
  species: string;
  norms: SearchName[];
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
  return { species, norms, pokemon };
});

const NORM_TO_POKEMON = new Map<string, Pokemon>();
for (const { norms, pokemon } of SEARCH_INDEX) {
  for (const { norm } of norms) NORM_TO_POKEMON.set(norm, pokemon);
}

// `eligible`, when given, keeps only the Pokémon it accepts.
export function findByName(query: string, eligible: PokemonFilter = null): Pokemon | null {
  const pokemon = NORM_TO_POKEMON.get(normalizeName(query)) || null;
  return pokemon && (!eligible || eligible(pokemon)) ? pokemon : null;
}

// The fewest edits (insert, delete, substitute, swap two neighbours) that
// turn `query` into some stretch of `text` — a prefix of it when
// `anchored`, anywhere in it otherwise. Stops early, returning Infinity,
// once no stretch can come within `maxEdits`.
function editsToMatch(query: string, text: string, maxEdits: number, anchored: boolean): number {
  const width = text.length + 1;
  let previousRow: number[] = new Array<number>(width);
  let twoRowsBack: number[] | null = null;
  for (let column = 0; column < width; column++) previousRow[column] = anchored ? column : 0;
  let best = Infinity;
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
  for (let column = 1; column < width; column++) best = Math.min(best, previousRow[column]);
  return best;
}

// How many typos a query of this length may carry: none under five
// letters, one from five, two from eight, three from twelve — "vensaur"
// gets one, "pikachoo" and "dusknior" two, "typhlosoin" two.
const typoAllowance = (query: string): number =>
  query.length < 5 ? 0 : Math.min(3, Math.floor(query.length / 4));

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
    let edits = editsToMatch(normalized, species, maxEdits, false);
    for (const { norm, speciesAt } of norms) {
      if (edits === 0) break;
      if (speciesAt === 0) edits = Math.min(edits, editsToMatch(normalized, norm, maxEdits, true));
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
