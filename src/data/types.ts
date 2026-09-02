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

// pick-stats.json: global pick data harvested from PokeDoku's daily
// puzzles (scripts/harvest-pick-stats.ts). `prior` is the running
// aggregate the app uses: per PokeDoku pokemon id, how many daily cells
// it was picked in and the sum of its pick shares there (share = its
// picks / all picks in that cell), so shareSum / cells is "when this
// Pokémon is a live answer, what share of players reach for it".
// `pending` is harvester state: the board(s) seen while current that will
// be archived once finished. The full per-puzzle data — the day's
// category spec (PokeDoku's own JSON, kept verbatim) and each cell's pick
// counts — lives outside the bundle, as one PickStatsPuzzle per file in
// public/archive/<id>.json (public/archive/index.json lists them), so
// the archive can grow forever without growing the app. The prior is
// rebuilt from those files on every harvest, so it never drifts from them.
export type PickPriorEntry = [cells: number, shareSum: number];

export interface PickStatsCell {
  total: number;
  // [pokemonId, count], most-picked first
  picks: [number, number][];
}

export interface PickStatsPuzzle {
  id: number;
  // date and spec are only readable while a puzzle is current; a puzzle
  // backfilled after its day lacks them
  date?: string;
  spec?: Record<string, unknown>;
  cells: PickStatsCell[];
}

// A board noted while it was current — puzzle ids are not in date order,
// so this is the only way to know which puzzle just finished. Archived
// with its final counts on the first harvest after it rotates out.
export interface PendingPuzzle {
  id: number;
  date: string;
  spec: Record<string, unknown>;
}

// public/archive/index.json: every archived puzzle, newest first
export type PickArchiveIndex = { id: number; date?: string }[];

export interface PickStatsData {
  meta: {
    generatedAt: string;
    puzzlesCounted: number;
    cellsCounted: number;
  };
  pending: PendingPuzzle[];
  prior: Record<string, PickPriorEntry>;
}

// pokedoku-names.json: PokeDoku's slug for each record that carries a form
export interface PokedokuName {
  name: string;
  specie: string;
  hidden?: boolean;
}
export type PokedokuNamesData = Record<string, PokedokuName>;
