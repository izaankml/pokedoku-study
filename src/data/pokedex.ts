import pokedexJson from "./pokedex.json";
import spritesJson from "./sprites.json";
import pokedokuNamesJson from "./pokedoku-names.json";
import type { PokedexData, PokedokuNamesData, Pokemon, SpritesData } from "./types.ts";

export type { Pokemon } from "./types.ts";

const data = pokedexJson as PokedexData;
// the JSON's entries are plain number arrays; SpriteEntry names their slots
const SPRITES = spritesJson as unknown as SpritesData;
const POKEDOKU_NAMES = pokedokuNamesJson as PokedokuNamesData;

// Every record, answers and the display-only forms. A species is always an
// answer; a form is an answer exactly when PokeDoku lists it as one — its
// answer list shows Pyroar Female, Lycanroc Midnight, the Burmy cloaks …
// as entries of their own, and hides a few (Cramorant's battle forms,
// Minior's colours) that stay in the data only so the detail sheet can
// draw a whole line. Categories, Browse, Drill, Cards and Grid use
// POKEMON, the answers only.
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

// Pokémon are named the way PokeDoku names them — species first, then the
// form ("Zapdos Galar", "Charizard Mega X", "Pikachu Partner"), and base
// species by their form too where PokeDoku does ("Lycanroc Midday",
// "Toxtricity Amped", "Meowstic Male") — built from its slug
// (scripts/build-pokedoku-names.ts) on the species' proper name (so
// "Mr. Mime Galar", not "Mr Mime Galar"). The dataset's own name
// ("Galarian Zapdos", "Lycanroc") is kept as `altName`, still searchable;
// `speciesName` is the plain species name.
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

// The sprites the player sees on PokeDoku itself (its CDN, keyed by
// PokeAPI id), with PokeAPI's as the fallback. sprites.json is built by
// scripts/build-sprites.ts and carries each sprite's alpha bounding box
// (`box`), because PokeDoku's CDN sends no CORS headers, so the app can't
// measure those on a canvas at runtime; PokeAPI's can be (`cors`).
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

// Warms the browser cache so a sprite is on screen the moment it's needed.
// Fetched the way <Sprite> fetches it, so the cached copy is reusable.
export function preloadSprite(pokemon: Pokemon): void {
  for (const { url, cors } of spriteCandidates(pokemon)) {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    img.src = url;
  }
}
