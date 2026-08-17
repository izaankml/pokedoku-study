import data from "./pokedex.json";
import SPRITES from "./sprites.json";
import POKEDOKU_NAMES from "./pokedoku-names.json";

// Every record, answers and the display-only forms. A species is always an
// answer; a form is an answer exactly when PokeDoku lists it as one — its
// answer list shows Pyroar Female, Lycanroc Midnight, the Burmy cloaks …
// as entries of their own, and hides a few (Cramorant's battle forms,
// Minior's colours) that stay in the data only so the detail sheet can
// draw a whole line. Categories, Browse, Drill, Cards and Grid use
// POKEMON, the answers only.
export const ALL_POKEMON = data.pokemon;
const isAnswer = (p) => !p.form || (POKEDOKU_NAMES[p.id] ? !POKEDOKU_NAMES[p.id].hidden : p.answer !== false);
export const POKEMON = ALL_POKEMON.filter(isAnswer);
export const DATA_META = data.meta;

export const POKEMON_BY_ID = new Map(ALL_POKEMON.map((p) => [p.id, p]));
export const POKEMON_BY_NAME = new Map(ALL_POKEMON.map((p) => [p.name, p]));

// Pokémon are named the way PokeDoku names them — species first, then the
// form ("Zapdos Galar", "Charizard Mega X", "Pikachu Partner"), and base
// species by their form too where PokeDoku does ("Lycanroc Midday",
// "Toxtricity Amped", "Meowstic Male") — built from its slug
// (scripts/build-pokedoku-names.mjs) on the species' proper name (so
// "Mr. Mime Galar", not "Mr Mime Galar"). The dataset's own name
// ("Galarian Zapdos", "Lycanroc") is kept as `altName`, still searchable;
// `speciesName` is the plain species name.
const SMALL = new Set(["of", "the", "and", "de"]);
const cap = (w) => (w ? w[0].toUpperCase() + w.slice(1) : w);
const words = (slug) => slug.split("-").map((w, i) => (i > 0 && SMALL.has(w) ? w : cap(w))).join(" ");
const SPECIES_NAME = new Map(ALL_POKEMON.filter((p) => !p.form).map((p) => [p.id, p.displayName]));
for (const p of ALL_POKEMON) {
  const species = SPECIES_NAME.get(p.species) || cap(POKEDOKU_NAMES[p.id]?.specie || "");
  p.speciesName = species;
  const pd = POKEDOKU_NAMES[p.id];
  let name;
  if (pd) {
    // the slug is species-then-form ("lycanroc-midday", "mr-mime-galar"),
    // bar PokeDoku's own "cowboy-hat-caterpie", where the species comes last
    const rest = pd.name.startsWith(`${pd.specie}-`)
      ? pd.name.slice(pd.specie.length + 1)
      : pd.name.endsWith(`-${pd.specie}`)
        ? pd.name.slice(0, -pd.specie.length - 1)
        : pd.name;
    name = `${species} ${words(rest)}`;
  } else if (p.form && p.answer === false) {
    // a display-only form PokeDoku has no name for: name it the same way
    name = `${species} ${words(p.form)}`;
  } else continue;
  if (name !== p.displayName) {
    p.altName = p.displayName;
    p.displayName = name;
  }
}

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
