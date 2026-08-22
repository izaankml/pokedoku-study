// The shapes of the generated dataset (src/data/pokedex.json, built by
// scripts/build-dataset.ts) and the two files keyed by the same ids.

export const TYPE_NAMES = [
  "normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison",
  "ground", "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark",
  "steel", "fairy",
] as const;
export type PokemonType = (typeof TYPE_NAMES)[number];

export const REGION_IDS = [
  "kanto", "johto", "hoenn", "sinnoh", "unova", "kalos", "alola", "galar", "hisui", "paldea",
] as const;
export type Region = (typeof REGION_IDS)[number];

export const EVO_METHODS = ["level", "item", "stone", "trade", "friendship"] as const;
export type EvoMethod = (typeof EVO_METHODS)[number];

export const STAGES = ["first", "middle", "final", "single"] as const;
export type Stage = (typeof STAGES)[number];

export const FLAGS = [
  "legendary", "mythical", "ultraBeast", "paradox", "fossil", "starter", "baby", "mega", "gmax",
] as const;
export type Flag = (typeof FLAGS)[number];

export interface AbilitySlot {
  name: string;
  hidden: boolean;
}

// One record of the dataset: a species, or an alternate form. `speciesName`
// and `altName` are filled in at load time (pokedex.ts) from PokeDoku's own
// names; everything else is written by the build script.
export interface Pokemon {
  // PokeAPI id: the dex number for a species, 10000+ for a form
  id: number;
  // dex number of the species (equals `id` for a species record)
  species: number;
  // the form's name ("Mega", "Galar", "Mega-X"), null for a species
  form: string | null;
  // dex slug ("charizardmegax")
  name: string;
  // as PokeDoku names it ("Charizard Mega X")
  displayName: string;
  // the dataset's own name where it differs ("Mega Charizard X")
  altName?: string;
  // the plain species name ("Charizard")
  speciesName: string;
  types: PokemonType[];
  gen: number;
  // where it (or the form) debuted; null for Meltan and Melmetal
  region: Region | null;
  // every region it counts for (a form that debuted elsewhere counts for two)
  regions: Region[];
  // null for Mega, Gigantamax and battle-only forms, which sit outside every line
  stage: Stage | null;
  evoMethods: EvoMethod[];
  evoItem: string | null;
  evoDetail: string | null;
  branched: boolean;
  flags: Flag[];
  // ids of the tracked moves it can learn (see traits.ts)
  moves: string[];
  // ids of the tracked abilities it can have (see traits.ts)
  abilities: string[];
  abilityList: AbilitySlot[];
  // the record it evolved from, null at the start of a line
  prevo: number | null;
  // any other records it evolves from (Gholdengo: Roaming Form Gimmighoul
  // as well as the Chest Form) — absent for nearly everyone
  otherPrevos?: number[];
  // false for a display-only form that is never an answer
  answer?: boolean;
}

export interface DataMeta {
  source: string;
  sourceVersion: string;
  generatedAt: string;
  count: number;
  answerCount: number;
  speciesCount: number;
}

export interface PokedexData {
  meta: DataMeta;
  pokemon: Pokemon[];
}

// sprites.json: [host, spriteId, x0, y0, bw, bh, w, h] — host 0 is
// PokeDoku's CDN, 1 is PokeAPI; the box is in sprite pixels.
export type SpriteEntry = [
  host: number,
  spriteId: number,
  x0: number,
  y0: number,
  bw: number,
  bh: number,
  w: number,
  h: number,
];
export type SpritesData = Record<string, SpriteEntry>;

// pokedoku-names.json: PokeDoku's slug for each record that carries a form
export interface PokedokuName {
  name: string;
  specie: string;
  hidden?: boolean;
}
export type PokedokuNamesData = Record<string, PokedokuName>;
