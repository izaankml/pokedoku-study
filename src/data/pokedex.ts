// `with { type: "json" }` lets Node load this module too (the pick-stats
// harvest reuses the category predicates); Vite ignores the attribute
import pokedexJson from "./pokedex.json" with { type: "json" };
import spritesJson from "./sprites.json" with { type: "json" };
import pokedokuNamesJson from "./pokedoku-names.json" with { type: "json" };
import type { PokedexData, PokedokuNamesData, Pokemon, SpritesData } from "./types.ts";

export type { Pokemon } from "./types.ts";

const data = pokedexJson as PokedexData;
// the JSON's entries are plain number arrays; SpriteEntry names their slots
const SPRITES = spritesJson as unknown as SpritesData;
const POKEDOKU_NAMES = pokedokuNamesJson as PokedokuNamesData;

// Every record, answers and display-only forms alike. A species is always
// an answer; a form is an answer exactly when PokeDoku lists it as one.
// The hidden forms stay in the data so the detail sheet can draw a whole
// line. Categories, Browse, Drill, Cards and Grid use POKEMON, the answers.
export const ALL_POKEMON: Pokemon[] = data.pokemon;
const isAnswer = (pokemon: Pokemon): boolean => {
  if (!pokemon.form) return true;
  const pokedokuName = POKEDOKU_NAMES[pokemon.id];
  return pokedokuName ? !pokedokuName.hidden : pokemon.answer !== false;
};
export const POKEMON: Pokemon[] = ALL_POKEMON.filter(isAnswer);

export const POKEMON_BY_ID = new Map<number, Pokemon>(ALL_POKEMON.map((pokemon) => [pokemon.id, pokemon]));
export const POKEMON_BY_NAME = new Map<string, Pokemon>(ALL_POKEMON.map((pokemon) => [pokemon.name, pokemon]));

// The detail-sheet slug resolver (useDetailHash): any record, or null for
// a slug left over from another view.
export const pokemonBySlug = (slug: string | null): Pokemon | null => (slug && POKEMON_BY_NAME.get(slug)) || null;

// Pokémon are named the way PokeDoku names them: species first, then the
// form ("Zapdos Galar", "Lycanroc Midday"), built from its slug on the
// species' proper name ("Mr. Mime Galar"). The dataset's own name
// ("Galarian Zapdos") is kept as `altName`, still searchable.
const SMALL = new Set(["of", "the", "and", "de"]);
const cap = (word: string): string => (word ? word[0].toUpperCase() + word.slice(1) : word);
const words = (slug: string): string =>
  slug
    .split("-")
    .map((word, index) => (index > 0 && SMALL.has(word) ? word : cap(word)))
    .join(" ");
const SPECIES_NAME = new Map<number, string>(
  ALL_POKEMON.filter((pokemon) => !pokemon.form).map((pokemon) => [pokemon.id, pokemon.displayName]),
);
for (const pokemon of ALL_POKEMON) {
  const pokedokuName = POKEDOKU_NAMES[pokemon.id];
  const species = SPECIES_NAME.get(pokemon.species) || cap(pokedokuName?.specie || "");
  pokemon.speciesName = species;
  let name: string;
  if (pokedokuName) {
    // the slug is species-then-form ("lycanroc-midday", "mr-mime-galar"),
    // bar PokeDoku's own "cowboy-hat-caterpie", where the species comes last
    const rest = pokedokuName.name.startsWith(`${pokedokuName.specie}-`)
      ? pokedokuName.name.slice(pokedokuName.specie.length + 1)
      : pokedokuName.name.endsWith(`-${pokedokuName.specie}`)
        ? pokedokuName.name.slice(0, -pokedokuName.specie.length - 1)
        : pokedokuName.name;
    name = `${species} ${words(rest)}`;
  } else if (pokemon.form && pokemon.answer === false) {
    // a display-only form PokeDoku has no name for: name it the same way
    name = `${species} ${words(pokemon.form)}`;
  } else continue;
  if (name !== pokemon.displayName) {
    pokemon.altName = pokemon.displayName;
    pokemon.displayName = name;
  }
}

const POKEDOKU_SPRITES = "https://pokedoku-space.nyc3.cdn.digitaloceanspaces.com/resources/pokemon";
const POKEAPI_SPRITES = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";

// A sprite's alpha bounding box, in sprite pixels, inside a w×h canvas.
export interface SpriteBox {
  x0: number;
  y0: number;
  bw: number;
  bh: number;
  w: number;
  h: number;
}

export interface SpriteCandidate {
  url: string;
  // known at build time (PokeDoku's CDN), or null to be measured at runtime
  box: SpriteBox | null;
  // whether the host sends CORS headers, so the sprite can be drawn on a canvas
  cors: boolean;
}

// PokeDoku's own sprites (its CDN, keyed by PokeAPI id), with PokeAPI's
// as the fallback. sprites.json carries each sprite's alpha bounding box
// because PokeDoku's CDN sends no CORS headers, so the app can't measure
// those at runtime; PokeAPI's can be.
function candidate(host: number, id: number, box: SpriteBox | null = null): SpriteCandidate {
  return host === 0
    ? { url: `${POKEDOKU_SPRITES}/${id}.png`, box, cors: false }
    : { url: `${POKEAPI_SPRITES}/${id}.png`, box, cors: true };
}

// Ordered list of { url, box, cors } to try for a Pokémon: the known-good
// sprite first, then PokeAPI's own and base-species sprites. Built once
// per Pokémon so the objects (and boxes) are stable across renders.
const candidateCache = new Map<number, SpriteCandidate[]>();
export function spriteCandidates(pokemon: Pokemon): SpriteCandidate[] {
  const cached = candidateCache.get(pokemon.id);
  if (cached) return cached;
  const out: SpriteCandidate[] = [];
  const known = SPRITES[pokemon.id];
  if (known) {
    const [host, id, x0, y0, bw, bh, w, h] = known;
    out.push(candidate(host, id, { x0, y0, bw, bh, w, h }));
  }
  for (const id of pokemon.species !== pokemon.id ? [pokemon.id, pokemon.species] : [pokemon.id]) {
    const fallback = candidate(1, id);
    if (!out.some((existing) => existing.url === fallback.url)) out.push(fallback);
  }
  candidateCache.set(pokemon.id, out);
  return out;
}
