import data from "./pokedex.json";

export const POKEMON = data.pokemon;
export const DATA_META = data.meta;

export const POKEMON_BY_ID = new Map(POKEMON.map((p) => [p.id, p]));

export function spriteUrl(id) {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
}
