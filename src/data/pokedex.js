import data from "./pokedex.json";

export const POKEMON = data.pokemon;
export const DATA_META = data.meta;

export const POKEMON_BY_ID = new Map(POKEMON.map((p) => [p.id, p]));

export function spriteUrl(id) {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
}

// A form whose own sprite is missing upstream (Partner Pikachu, Mega
// Zygarde) falls back to its base species' sprite.
export function spriteCandidates(pokemon) {
  const ids = [pokemon.id];
  if (pokemon.species !== pokemon.id) ids.push(pokemon.species);
  return ids.map(spriteUrl);
}

// Warms the browser cache so a sprite is on screen the moment it's needed.
// Fetched with CORS like <Sprite> does, so the cached copy is reusable.
export function preloadSprite(pokemon) {
  for (const url of spriteCandidates(pokemon)) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
  }
}
