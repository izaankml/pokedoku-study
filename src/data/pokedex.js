import data from "./pokedex.json";
import SPRITES from "./sprites.json";

export const POKEMON = data.pokemon;
export const DATA_META = data.meta;

export const POKEMON_BY_ID = new Map(POKEMON.map((p) => [p.id, p]));

const POKEDOKU_SPRITES = "https://pokedoku-space.nyc3.cdn.digitaloceanspaces.com/resources/pokemon";
const POKEAPI_SPRITES = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";

// The sprites the player sees on PokeDoku itself (its CDN, keyed by
// PokeAPI id), with PokeAPI's as the fallback. sprites.json is built by
// scripts/build-sprites.mjs and carries each sprite's alpha bounding box
// (`box`), because PokeDoku's CDN sends no CORS headers, so the app can't
// measure those on a canvas at runtime; PokeAPI's can be (`cors`).
function candidate(host, id, box = null) {
  return host === 0
    ? { url: `${POKEDOKU_SPRITES}/${id}.png`, box, cors: false }
    : { url: `${POKEAPI_SPRITES}/${id}.png`, box, cors: true };
}

// Ordered list of { url, box, cors } to try for a Pokémon: the known-good
// sprite first, then PokeAPI's own and base-species sprites. Built once
// per Pokémon so the objects (and boxes) are stable across renders.
const candidateCache = new Map();
export function spriteCandidates(pokemon) {
  let out = candidateCache.get(pokemon.id);
  if (out) return out;
  out = [];
  const known = SPRITES[pokemon.id];
  if (known) {
    const [host, id, x0, y0, bw, bh, w, h] = known;
    out.push(candidate(host, id, { x0, y0, bw, bh, w, h }));
  }
  for (const id of pokemon.species !== pokemon.id ? [pokemon.id, pokemon.species] : [pokemon.id]) {
    const c = candidate(1, id);
    if (!out.some((o) => o.url === c.url)) out.push(c);
  }
  candidateCache.set(pokemon.id, out);
  return out;
}

// Warms the browser cache so a sprite is on screen the moment it's needed.
// Fetched the way <Sprite> fetches it, so the cached copy is reusable.
export function preloadSprite(pokemon) {
  for (const { url, cors } of spriteCandidates(pokemon)) {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    img.src = url;
  }
}
