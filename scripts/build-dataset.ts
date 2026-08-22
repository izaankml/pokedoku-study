// Generates src/data/pokedex.json from @pkmn/dex (Pokémon Showdown's data).
//
// @pkmn/dex is NOT a dependency of this project (it is ~50 MB installed).
// Install it anywhere and point this script at that installation:
//
//   npm install --no-save @pkmn/dex
//   npm run build-data            # looks in ./node_modules
//   node scripts/build-dataset.ts /some/dir/with/node_modules
//
// The script validates the generated data against known-good counts and
// spot checks, and exits non-zero if anything is off. To audit the result
// against pokedoku-helper.com's PokeAPI-derived data, run
// scripts/check-against-helper.ts afterwards.
//
// Category semantics follow PokeDoku (its "How to play" and the notes in
// its UI):
// - A record is one PokeDoku answer: a species, or an alternate form that
//   answers some cell the base species can't. Mega and Gigantamax forms are
//   the answers to the Mega/Gigantamax categories; the base species is not.
// - Regions: regional forms count only for the region they debuted in; Mega,
//   Gigantamax and Primal forms count for the base species' region; any
//   other form that debuted in a different region counts for both.
// - Evolution is form-aware (Kantonian Farfetch'd has no evolution line;
//   Galarian Farfetch'd is first stage) and a Pokémon counts for every
//   evolution method that works in some core game (Alakazam: trade AND
//   item, via the Linking Cord). Mega/Gigantamax forms and battle-only
//   Ash-Greninja/Eternamax have no evolution categories at all.
// - Move categories are "can learn the move" (any core game, any method
//   except events); Gigantamax forms have no moves.

import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BABY_IDS,
  STARTER_BASE_IDS,
  FOSSIL_IDS,
  ULTRA_BEAST_IDS,
  PARADOX_IDS,
  HISUI_IDS,
  HISUI_FORM_IDS,
  NO_REGION_IDS,
  FORM_DEBUT_REGION_OVERRIDES,
  FORM_IDS,
  EVO_METHOD_OVERRIDES,
  EVO_ITEM_OVERRIDES,
  EVO_DETAIL_OVERRIDES,
  PREVO_OVERRIDES,
  EXTRA_PREVOS,
  DISPLAY_NAME_OVERRIDES,
  CLONED_FORMS,
} from "./manual-lists.ts";
import { MOVES, ABILITIES } from "../src/data/traits.ts";
import type { AbilitySlot, EvoMethod, Flag, PokedexData, Pokemon, PokemonType, Region, Stage } from "../src/data/types.ts";

// ---- @pkmn/dex, as far as this script reads it ---------------------------
//
// The package isn't installed here (see above), so its shapes are spelled
// out rather than imported.

interface DexSpecies {
  // national dex number
  num: number;
  // dex slug ("charizardmegax")
  id: string;
  // "Charizard-Mega-X"
  name: string;
  // the form's name ("Mega-X"), "" for a base species
  forme: string;
  baseSpecies: string;
  isNonstandard?: string | null;
  types: string[];
  gen: number;
  tags: string[];
  abilities: Partial<Record<"0" | "1" | "H" | "S", string>>;
  prevo?: string;
  evoType?: string;
  evoItem?: string;
  evoLevel?: number;
  evoMove?: string;
  evoCondition?: string;
  // the form it switches from (Rotom-Wash <- Rotom)
  changesFrom?: string;
}

interface DexMove {
  exists: boolean;
  id: string;
}

interface DexLearnset {
  // move id -> sources ("9M", "5S0", …)
  learnset?: Record<string, string[]>;
}

interface PkmnDex {
  species: { all(): DexSpecies[]; get(name: string): DexSpecies };
  moves: { get(name: string): DexMove };
  learnsets: { get(id: string): Promise<DexLearnset | undefined> };
}

const searchRoot = process.argv[2] || process.cwd();
const requireFrom = createRequire(join(searchRoot, "noop.js"));
const { Dex } = requireFrom("@pkmn/dex") as { Dex: PkmnDex };
const dexVersion = (requireFrom("@pkmn/dex/package.json") as { version: string }).version;

const MAX_NUM = 1025;
// National dex number of the last species of each generation
const GEN_ENDS = [151, 251, 386, 493, 649, 721, 809, 905, 1025];
const GEN_REGIONS: Region[] = [
  "kanto", "johto", "hoenn", "sinnoh", "unova", "kalos", "alola", "galar", "paldea",
];
const EXPECTED_GEN_COUNTS = [151, 100, 135, 107, 156, 72, 88, 96, 120];

const genOf = (num: number): number => GEN_ENDS.findIndex((end) => num <= end) + 1;

const all = Dex.species.all();
const species = all
  .filter((entry) => entry.num >= 1 && entry.num <= MAX_NUM && !entry.forme && !entry.isNonstandard)
  .concat(
    // "Past" species (not in the current games' dex) are still real species
    all.filter(
      (entry) => entry.num >= 1 && entry.num <= MAX_NUM && !entry.forme && entry.isNonstandard === "Past",
    ),
  )
  .sort((a, b) => a.num - b.num);

// Alternate forms (regional variants, Megas, Rotom appliances, ...). Only
// those in FORM_IDS become records, but the whole set takes part in the
// evolution graph so form-to-form links (Growlithe-Hisui -> Arcanine-Hisui)
// resolve.
const formes = all
  .filter((entry) => entry.num >= 1 && entry.num <= MAX_NUM && entry.forme && entry.isNonstandard !== "CAP")
  .sort((a, b) => a.num - b.num);

const REGIONAL_ADJECTIVE: Record<string, string> = {
  Alola: "Alolan",
  Galar: "Galarian",
  Hisui: "Hisuian",
  Paldea: "Paldean",
};
const isRegionalForme = (entry: DexSpecies): boolean => entry.forme.split("-")[0] in REGIONAL_ADJECTIVE;
// The dex's isMega flag is missing on some Legends Z-A formes ("Mega-Z",
// "M-Mega"), so go by the forme name.
const isMegaForme = (entry: DexSpecies): boolean => /(^|-)Mega(-|$)/.test(entry.forme || "");
const isGmaxForme = (entry: DexSpecies): boolean => /(^|-)Gmax$/.test(entry.forme || "");
const isPrimalForme = (entry: DexSpecies): boolean => entry.forme === "Primal";
const isPartnerForme = (entry: DexSpecies): boolean => entry.forme === "Starter"; // Let's Go partners
// Forms PokeDoku gives no evolution categories at all
const hasNoEvolution = (entry: DexSpecies): boolean =>
  isMegaForme(entry) || isGmaxForme(entry) || entry.forme === "Ash" || entry.forme === "Eternamax";

// ---- evolution graph ----------------------------------------------------
//
// One graph over species + forms. A form's parent is whatever the dex names
// (Sirfetch'd <- Farfetch'd-Galar), so a base species whose only evolution
// belongs to a regional form (Kantonian Farfetch'd, Corsola, Qwilfish, Red-
// Striped Basculin) has no evolution line — which is how PokeDoku sees it.

const pool = species.concat(formes);
const byName = new Map(pool.map((entry) => [entry.name, entry]));

const lookUp = (name: string, child: DexSpecies): DexSpecies => {
  const parent = byName.get(name);
  if (!parent) throw new Error(`unknown prevo "${name}" for ${child.name}`);
  return parent;
};

// The dex's pre-evolution (the record's `prevo`)
function parentOf(entry: DexSpecies): DexSpecies | null {
  const prevoName = PREVO_OVERRIDES[entry.id] || entry.prevo;
  return prevoName ? lookUp(prevoName, entry) : null;
}

// Every pre-evolution: the dex's, then any EXTRA_PREVOS (Gholdengo: Chest
// Form Gimmighoul, then Roaming Form)
function parentsOf(entry: DexSpecies): DexSpecies[] {
  const parent = parentOf(entry);
  return (parent ? [parent] : []).concat((EXTRA_PREVOS[entry.id] || []).map((name) => lookUp(name, entry)));
}

const childrenOf = new Map<string, DexSpecies[]>();
for (const entry of pool) {
  for (const parent of parentsOf(entry)) {
    const siblings = childrenOf.get(parent.name);
    if (siblings) siblings.push(entry);
    else childrenOf.set(parent.name, [entry]);
  }
}

function stageOf(entry: DexSpecies): Stage {
  const hasParent = parentsOf(entry).length > 0;
  const hasChildren = childrenOf.has(entry.name);
  if (!hasParent && !hasChildren) return "single";
  if (!hasParent) return "first";
  if (hasChildren) return "middle";
  return "final";
}

// "Branched: a pre-evo that can evolve into completely different Pokémon
// (excluding forms of the same Pokémon)" — so Rockruff (three Lycanroc
// forms) is not branched, Scyther (Scizor or Kleavor) is.
function isBranched(entry: DexSpecies): boolean {
  const kids = childrenOf.get(entry.name) || [];
  return new Set(kids.map((kid) => kid.num)).size >= 2;
}

// The record a Pokémon evolved from, for drawing evolution lines: the
// parent species' number, or the parent form's record id when that form has
// one (Sirfetch'd <- Farfetch'd-Galar). Filled in once the form records are
// known — see prevoIdOf below.

// ---- evolution methods --------------------------------------------------

const EVO_STONES = new Set([
  "Fire Stone", "Water Stone", "Thunder Stone", "Leaf Stone", "Moon Stone",
  "Sun Stone", "Shiny Stone", "Dusk Stone", "Dawn Stone", "Ice Stone",
]);

// Every method the Pokémon counts for. "stone" is a subset of "item": a
// used (not held) evolution stone.
function evoMethodsOf(entry: DexSpecies): EvoMethod[] {
  if (EVO_METHOD_OVERRIDES[entry.id]) return EVO_METHOD_OVERRIDES[entry.id];
  if (!parentOf(entry)) return [];
  switch (entry.evoType) {
    case undefined:
    case "levelExtra":
    case "levelMove":
      return ["level"];
    case "levelFriendship":
      return ["friendship", "level"];
    case "useItem":
      return entry.evoItem !== undefined && EVO_STONES.has(entry.evoItem) ? ["item", "stone"] : ["item"];
    case "levelHold":
      return ["item", "level"];
    case "trade":
      return entry.evoItem ? ["trade", "item"] : ["trade"];
    case "other":
      throw new Error(`"other" evolution needs an EVO_METHOD_OVERRIDES entry: ${entry.name}`);
    default:
      throw new Error(`unmapped evoType "${entry.evoType}" on ${entry.name}`);
  }
}

// The item an item evolution needs (used, held, or held while trading).
function evoItemOf(entry: DexSpecies, methods: EvoMethod[]): string | null {
  if (!methods.includes("item")) return null;
  const item = EVO_ITEM_OVERRIDES[entry.id] || entry.evoItem || null;
  if (!item) throw new Error(`item evolution without an item: ${entry.name}`);
  return item;
}

const withArticle = (item: string): string =>
  /^(a |an )/.test(item) ? item : `${/^[aeiou]/i.test(item) ? "an" : "a"} ${item}`;
const cap = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

// How it evolves, in words: "Level 36", "Use a Water Stone", "Level up
// holding a Razor Claw at night", "High friendship during the day", ...
function evoDetailOf(entry: DexSpecies, methods: EvoMethod[], item: string | null): string | null {
  if (!parentOf(entry)) return null;
  if (EVO_DETAIL_OVERRIDES[entry.id]) return EVO_DETAIL_OVERRIDES[entry.id];
  const condition = entry.evoCondition ? ` ${entry.evoCondition}` : "";
  switch (entry.evoType) {
    case undefined:
      return entry.evoLevel ? `Level ${entry.evoLevel}${condition}` : `Level up${condition}`;
    case "levelMove":
      return `Level up knowing ${entry.evoMove}${condition}`;
    case "levelExtra":
      return `Level up${condition}`;
    case "levelFriendship":
      return `High friendship${condition}`;
    case "useItem":
      return `Use ${withArticle(item ?? "")}${condition}`;
    case "levelHold":
      return `Level up holding ${withArticle(item ?? "")}${condition}`;
    case "trade":
      return item ? `Trade holding ${withArticle(item)}` : `Trade${condition}`;
    case "other":
      if (methods.length === 0 && !entry.evoCondition) return null;
      return cap(entry.evoCondition ?? "");
    default:
      return null;
  }
}

// ---- moves & abilities --------------------------------------------------

// [our move id, the dex's move id]
const MOVE_IDS: [string, string][] = MOVES.map((move) => {
  const dexMove = Dex.moves.get(move.name);
  if (!dexMove.exists) throw new Error(`unknown move ${move.name}`);
  return [move.id, dexMove.id];
});
const ABILITY_NAMES = new Map(ABILITIES.map((ability) => [ability.name, ability.id]));

const learnsetCache = new Map<string, Record<string, string[]> | null>();
async function ownLearnset(entry: DexSpecies): Promise<Record<string, string[]> | null> {
  let learnset = learnsetCache.get(entry.id);
  if (learnset === undefined) {
    learnset = (await Dex.learnsets.get(entry.id))?.learnset || null;
    learnsetCache.set(entry.id, learnset);
  }
  return learnset;
}

// Union of the learnsets along the "changes from" chain (Rotom-Wash learns
// what Rotom does plus Hydro Pump); a form with no learnset of its own (Mega,
// cosmetic) uses its base. Event-only sources ("5S0") don't count.
async function learnableMoves(entry: DexSpecies): Promise<string[]> {
  const learnable = new Set<string>();
  let current: DexSpecies | undefined = entry;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    const learnset = await ownLearnset(current);
    if (learnset) {
      for (const [id, dexId] of MOVE_IDS) {
        if (learnset[dexId]?.some((source) => !/^\dS/.test(source))) learnable.add(id);
      }
    }
    if (current.changesFrom) current = Dex.species.get(current.changesFrom);
    else if (!learnset && current.forme) current = Dex.species.get(current.baseSpecies);
    else break;
  }
  return MOVES.map((move) => move.id).filter((id) => learnable.has(id));
}

function abilitySlots(entry: DexSpecies): DexSpecies["abilities"] {
  return entry.abilities && Object.keys(entry.abilities).length
    ? entry.abilities
    : Dex.species.get(entry.baseSpecies).abilities;
}

// The tracked-ability category ids (Intimidate, Levitate, ...)
function abilitiesOf(entry: DexSpecies): string[] {
  const names = Object.values(abilitySlots(entry));
  return ABILITIES.map((ability) => ability.id).filter((id) =>
    names.some((name) => ABILITY_NAMES.get(name) === id),
  );
}

// Every ability, for display: regular slots first, then the hidden ability
// (H) and any special one (S, e.g. Own Tempo Rockruff) marked as such.
// The dex's "S" (special) slot: Battle Bond Greninja and Power Construct
// Zygarde are ordinary Greninja / Zygarde with that ability, so it stays;
// Own Tempo Rockruff is a form of its own (its record has the ability), so
// base Rockruff doesn't list it.
const SPECIAL_ABILITY_OWN_FORM = new Set(["rockruff"]);
function abilityListOf(entry: DexSpecies): AbilitySlot[] {
  const slots = abilitySlots(entry);
  const list: AbilitySlot[] = [];
  for (const key of ["0", "1"] as const) {
    const name = slots[key];
    if (name) list.push({ name, hidden: false });
  }
  if (slots.H) list.push({ name: slots.H, hidden: true });
  if (slots.S && !SPECIAL_ABILITY_OWN_FORM.has(entry.id)) list.push({ name: slots.S, hidden: true });
  return list;
}

// ---- flags --------------------------------------------------------------

// Starters: expand base forms to their whole evolution lines (species only)
const starterIds = new Set<number>();
for (const entry of species) {
  if (!STARTER_BASE_IDS.has(entry.num)) continue;
  const queue = [entry];
  while (queue.length) {
    const current = queue.pop() as DexSpecies;
    starterIds.add(current.num);
    queue.push(...(childrenOf.get(current.name) || []).filter((child) => !child.forme));
  }
}

const isLegendary = (entry: DexSpecies): boolean =>
  entry.tags.includes("Sub-Legendary") || entry.tags.includes("Restricted Legendary");

function speciesFlags(entry: DexSpecies): Flag[] {
  const flags: Flag[] = [];
  if (isLegendary(entry)) flags.push("legendary");
  if (entry.tags.includes("Mythical")) flags.push("mythical");
  if (ULTRA_BEAST_IDS.has(entry.num)) flags.push("ultraBeast");
  if (PARADOX_IDS.has(entry.num)) flags.push("paradox");
  if (FOSSIL_IDS.has(entry.num)) flags.push("fossil");
  if (starterIds.has(entry.num)) flags.push("starter");
  if (BABY_IDS.has(entry.num)) flags.push("baby");
  return flags;
}

// Forms inherit the species-level flags. First partner only carries over to
// regional forms (Hisuian Typhlosion) and the Let's Go partners — not to
// Mega/Gigantamax forms or Ash-Greninja (PokeDoku's lists).
function formFlags(entry: DexSpecies, base: Pick<Pokemon, "flags">): Flag[] {
  const flags = base.flags.filter((flag) => flag !== "starter" || isRegionalForme(entry));
  if (isPartnerForme(entry)) flags.push("starter");
  if (isLegendary(entry) && !flags.includes("legendary")) flags.push("legendary");
  if (entry.tags.includes("Mythical") && !flags.includes("mythical")) flags.push("mythical");
  if (isMegaForme(entry)) flags.push("mega");
  if (isGmaxForme(entry)) flags.push("gmax");
  return flags;
}

// ---- regions ------------------------------------------------------------

function speciesRegion(entry: DexSpecies): Region | null {
  if (NO_REGION_IDS.has(entry.num)) return null;
  return HISUI_IDS.has(entry.num) ? "hisui" : GEN_REGIONS[genOf(entry.num) - 1];
}

// `region` is where the form debuted; `regions` is every region category it
// counts for (see the header comment).
function formRegion(entry: DexSpecies, base: Pick<Pokemon, "gen" | "region" | "regions">): Pick<Pokemon, "gen" | "region" | "regions"> {
  if (isMegaForme(entry) || isGmaxForme(entry) || isPrimalForme(entry) || isPartnerForme(entry)) {
    return { gen: base.gen, region: base.region, regions: base.regions };
  }
  const gen = entry.gen;
  let region = FORM_DEBUT_REGION_OVERRIDES[entry.id];
  if (!region) {
    const hisui =
      gen === 8 &&
      (entry.forme.startsWith("Hisui") || HISUI_IDS.has(entry.num) || HISUI_FORM_IDS.has(entry.id));
    region = hisui ? "hisui" : GEN_REGIONS[gen - 1];
  }
  const regions =
    isRegionalForme(entry) || region === base.region || base.region === null
      ? [region]
      : [base.region, region];
  return { gen, region, regions };
}

// ---- names --------------------------------------------------------------
//
// These are the dataset's own names ("Hisuian Growlithe", "Mega Charizard
// X"). The app shows forms the way PokeDoku does ("Growlithe Hisui",
// "Charizard Mega X") using src/data/pokedoku-names.json (see
// scripts/build-pokedoku-names.ts) and keeps these as `altName` for search.

function formDisplayName(entry: DexSpecies): string {
  if (DISPLAY_NAME_OVERRIDES[entry.id]) return DISPLAY_NAME_OVERRIDES[entry.id];
  const base = DISPLAY_NAME_OVERRIDES[Dex.species.get(entry.baseSpecies).id] || entry.baseSpecies;
  const parts = entry.forme.split("-");
  if (parts[0] === "Mega" || parts[0] === "Primal") {
    return [parts[0], base, ...parts.slice(1)].join(" ");
  }
  if (parts[parts.length - 1] === "Gmax") {
    const rest = parts.slice(0, -1).join(" ");
    return rest ? `Gigantamax ${base} (${rest})` : `Gigantamax ${base}`;
  }
  const adjective = REGIONAL_ADJECTIVE[parts[0]];
  if (adjective) {
    const rest = parts.slice(1).join(" ");
    return rest ? `${adjective} ${base} (${rest})` : `${adjective} ${base}`;
  }
  return `${base} (${parts.join(" ")})`;
}

// ---- assemble -----------------------------------------------------------

// A record as written to pokedex.json: everything the app's Pokemon type
// has bar what the app fills in at load time (speciesName, altName); `prevo`
// is set once every record is known.
type Record_ = Omit<Pokemon, "speciesName" | "altName" | "prevo"> & { prevo?: number | null };
// The evolution fields a record carries
type Evolution = Pick<Pokemon, "stage" | "evoMethods" | "evoItem" | "evoDetail" | "branched">;

const toTypes = (entry: DexSpecies): PokemonType[] => entry.types.map((type) => type.toLowerCase() as PokemonType);

const baseRecords: Record_[] = [];
for (const entry of species) {
  const region = speciesRegion(entry);
  const evoMethods = evoMethodsOf(entry);
  const evoItem = evoItemOf(entry, evoMethods);
  baseRecords.push({
    id: entry.num,
    species: entry.num,
    form: null,
    name: entry.id,
    displayName: DISPLAY_NAME_OVERRIDES[entry.id] || entry.name,
    types: toTypes(entry),
    gen: genOf(entry.num),
    region,
    regions: region ? [region] : [],
    stage: stageOf(entry),
    evoMethods,
    evoItem,
    evoDetail: evoDetailOf(entry, evoMethods, evoItem),
    branched: isBranched(entry),
    flags: speciesFlags(entry),
    moves: await learnableMoves(entry),
    abilities: abilitiesOf(entry),
    abilityList: abilityListOf(entry),
  });
}
const baseById = new Map(baseRecords.map((record) => [record.id, record]));
const baseOf = (num: number): Record_ => {
  const base = baseById.get(num);
  if (!base) throw new Error(`no base record for species ${num}`);
  return base;
};

// Stage/methods for a form: from the evolution graph when it takes part in
// one (Growlithe-Hisui, Wormadam-Sandy); otherwise inherited from the form
// it changes from (Zen Darmanitan-Galar <- Darmanitan-Galar, Rotom-Wash <-
// Rotom). A form with neither (Bloodmoon Ursaluna, Paldean Tauros, Partner
// Pikachu) is its own single-stage line.
const evoCache = new Map<string, Evolution>();
const evolutionOf = ({ stage, evoMethods, evoItem, evoDetail, branched }: Evolution): Evolution => ({
  stage,
  evoMethods,
  evoItem,
  evoDetail,
  branched,
});
function formEvolution(entry: DexSpecies): Evolution {
  const cached = evoCache.get(entry.id);
  if (cached) return cached;
  let result: Evolution;
  const none: Evolution = { stage: "single", evoMethods: [], evoItem: null, evoDetail: null, branched: false };
  if (hasNoEvolution(entry)) {
    result = { ...none, stage: null };
  } else if (parentOf(entry) || childrenOf.has(entry.name)) {
    const evoMethods = evoMethodsOf(entry);
    const evoItem = evoItemOf(entry, evoMethods);
    result = {
      stage: stageOf(entry),
      evoMethods,
      evoItem,
      evoDetail: evoDetailOf(entry, evoMethods, evoItem),
      branched: isBranched(entry),
    };
  } else if (entry.changesFrom) {
    const from = Dex.species.get(entry.changesFrom);
    result = from.forme ? formEvolution(from) : evolutionOf(baseOf(entry.num));
  } else {
    result = none;
  }
  evoCache.set(entry.id, result);
  return result;
}

// A form only earns an *answer* record if it can answer some cell its base
// species cannot: a type the base lacks, a different type count, region,
// stage, method, flag, move or ability. Otherwise the base record already
// covers it — the form is still written, as `answer: false`, so the detail
// sheet can draw it (Rockruff → Lycanroc / Midnight / Dusk; Kyurem ⇢
// Black / White) without it ever being an answer anywhere.
function coversNothingNew(form: Record_, base: Record_): boolean {
  const subset = <T>(a: readonly T[], b: readonly T[]): boolean => a.every((item) => b.includes(item));
  return (
    subset(form.types, base.types) &&
    form.types.length === base.types.length &&
    subset(form.regions, base.regions) &&
    (form.stage === null || form.stage === base.stage) &&
    subset(form.evoMethods, base.evoMethods) &&
    (!form.branched || base.branched) &&
    subset(form.flags, base.flags) &&
    subset(form.moves, base.moves) &&
    subset(form.abilities, base.abilities)
  );
}

// the dex's name for a form where it isn't the game's — and a transformation
// that belongs to one particular form carries that form's name first, the
// way the dex's own "Droopy-Mega" and "Galar-Zen" do, so the app can tell
// whose it is: Mega Floette is Eternal Flower Floette's (dex: changesFrom)
const FORM_NAME_OVERRIDES: Record<string, string> = { rockruffdusk: "Own-Tempo", floettemega: "Eternal-Mega" };
const candidateForms = formes.filter((entry) => entry.id in FORM_IDS);
const droppedForms: Record_[] = [];
const formRecords: Record_[] = [];
for (const entry of candidateForms) {
  const base = baseOf(entry.num);
  const record: Record_ = {
    id: FORM_IDS[entry.id],
    species: entry.num,
    form: FORM_NAME_OVERRIDES[entry.id] || entry.forme,
    name: entry.id,
    displayName: formDisplayName(entry),
    types: toTypes(entry),
    ...formRegion(entry, base),
    ...formEvolution(entry),
    flags: formFlags(entry, base),
    moves: isGmaxForme(entry) ? [] : await learnableMoves(entry),
    abilities: abilitiesOf(entry),
    abilityList: abilityListOf(entry),
  };
  if (record.id >= 90000) {
    // PokeDoku's own cosmetic entries: never answers; a Deerling season has
    // no dex children of its own, so its evolution fields are its base's
    droppedForms.push({ ...record, ...evolutionOf(base), answer: false });
  } else if (coversNothingNew(record, base)) droppedForms.push({ ...record, answer: false });
  else formRecords.push(record);
}

// prevo: the record this Pokémon evolved from (null at the start of a line
// or for Mega/Gigantamax/battle forms, which have no evolution categories)
const keptFormIds = new Set(formRecords.concat(droppedForms).map((record) => record.id));
const recordIdOf = (parent: DexSpecies): number =>
  parent.forme && parent.id in FORM_IDS && keptFormIds.has(FORM_IDS[parent.id]) ? FORM_IDS[parent.id] : parent.num;
function prevoIdOf(entry: DexSpecies): number | null {
  if (hasNoEvolution(entry)) return null;
  const parent = parentOf(entry);
  return parent ? recordIdOf(parent) : null;
}
const poolById = new Map(pool.map((entry) => [entry.id, entry]));
const dexEntryOf = (record: Record_): DexSpecies => {
  const entry = poolById.get(record.name);
  if (!entry) throw new Error(`no dex entry for ${record.name}`);
  return entry;
};
for (const record of baseRecords.concat(formRecords, droppedForms)) {
  const entry = dexEntryOf(record);
  record.prevo = prevoIdOf(entry);
  // the other pre-evolutions (EXTRA_PREVOS), only where there are any
  const others = hasNoEvolution(entry) ? [] : parentsOf(entry).slice(1).map(recordIdOf);
  if (others.length) record.otherPrevos = others;
}

// The entries PokeDoku lists on its own with no dex forme behind them:
// clones of the species record, display-only (see CLONED_FORMS)
for (const clone of CLONED_FORMS) {
  const base = baseOf(clone.species);
  droppedForms.push({
    ...base,
    id: clone.id,
    form: clone.form,
    name: clone.name,
    displayName: `${base.displayName} (${clone.form})`,
    prevo: clone.prevo ?? null,
    answer: false,
  });
}

// Base species first, then its forms, in dex order.
const records = baseRecords
  .concat(formRecords)
  .concat(droppedForms)
  .sort((a, b) => a.species - b.species || (a.form === null ? -1 : b.form === null ? 1 : 0));

// ---- validate -----------------------------------------------------------

const failures: string[] = [];
const check = (condition: boolean, message: string): void => {
  if (!condition) failures.push(message);
};
const byId = new Map(records.map((record) => [record.id, record]));
const byDexId = new Map(records.map((record) => [record.name, record]));
// A record by slug; a missing one is a failure, and the checks on it are
// skipped (they'd fail too) rather than crash the run.
const get = (name: string): Record_ => {
  const record = byDexId.get(name);
  if (record) return record;
  failures.push(`missing record ${name}`);
  return { ...baseRecords[0], id: -1, name, displayName: "", stage: null, evoMethods: [], evoItem: null, evoDetail: null, flags: [], moves: [], abilities: [], abilityList: [], regions: [], region: null, branched: false, types: [] };
};
// Base-species counts (forms are validated separately below)
const count = (predicate: (record: Record_) => boolean): number => baseRecords.filter(predicate).length;
const has = (id: number, flag: Flag): boolean => byId.get(id)?.flags.includes(flag) ?? false;
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

check(baseRecords.length === MAX_NUM, `species count ${baseRecords.length} != ${MAX_NUM}`);
check(new Set(records.map((record) => record.id)).size === records.length, "duplicate ids");
check(new Set(records.map((record) => record.name)).size === records.length, "duplicate names");
for (let gen = 1; gen <= 9; gen++) {
  const found = count((record) => record.gen === gen);
  check(
    found === EXPECTED_GEN_COUNTS[gen - 1],
    `gen ${gen} count ${found} != ${EXPECTED_GEN_COUNTS[gen - 1]}`,
  );
}
check(new Set(records.flatMap((record) => record.types)).size === 18, "expected exactly 18 types");
check(records.every((record) => record.types.length >= 1 && record.types.length <= 2), "bad types length");
check(count((record) => record.flags.includes("ultraBeast")) === 11, "ultra beasts != 11");
check(count((record) => record.flags.includes("paradox")) === 22, "paradox != 22");
check(count((record) => record.flags.includes("fossil")) === 25, "fossil != 25");
check(count((record) => record.flags.includes("starter")) === 81, "starter != 81");
check(count((record) => record.flags.includes("baby")) === 19, "baby != 19");
check(count((record) => record.flags.includes("legendary")) === 71, "legendary != 71");
check(count((record) => record.flags.includes("mythical")) === 23, "mythical != 23");
check(count((record) => record.flags.includes("mega") || record.flags.includes("gmax")) === 0, "species carry no mega/gmax");
check(count((record) => record.region === "hisui") === 7, "hisui species != 7");
check(count((record) => record.region === null) === 2, "species without a region != 2 (Meltan, Melmetal)");
check(
  records.every((record) => (record.region === null ? record.regions.length === 0 : record.regions.includes(record.region))),
  "regions must contain region",
);
check(records.every((record) => record.regions.length <= 2), "at most two regions");
check(baseRecords.every((record) => record.regions.length <= 1), "species have at most one region");
check(count((record) => record.branched) === 15, "branched species != 15");
check(count((record) => record.stage === "single") === 205, "single-stage species != 205");
check(count((record) => record.evoMethods.includes("stone")) === 44, "stone evolutions != 44");
check(records.every((record) => !record.evoMethods.includes("stone") || record.evoMethods.includes("item")), "stone implies item");
check(records.every((record) => record.evoMethods.includes("item") === (record.evoItem !== null)), "item evolutions name their item");
check(get("vaporeon").evoItem === "Water Stone" && get("alakazam").evoItem === "Linking Cord", "evo items");
check(get("steelix").evoItem === "Metal Coat" && get("weavile").evoItem === "Razor Claw", "held evo items");
check(get("kleavor").evoItem === "Black Augurite" && get("pikachu").evoItem === null, "evo item overrides / none");
check(get("charizard").evoDetail === "Level 36", "Charizard: Level 36");
check(get("vaporeon").evoDetail === "Use a Water Stone", "Vaporeon detail");
check(get("weavile").evoDetail === "Level up holding a Razor Claw at night", "Weavile detail");
check(get("umbreon").evoDetail === "High friendship at night", "Umbreon detail");
check(get("steelix").evoDetail === "Trade holding a Metal Coat", "Steelix detail");
check(get("escavalier").evoDetail === "Trade with a Shelmet", "Escavalier detail");
check(get("hydrapple").evoDetail === "Level up knowing Dragon Cheer", "Hydrapple detail");
check(get("kingambit").evoDetail === "Defeat 3 Bisharp leading Pawniard and level-up", "Kingambit detail");
check(records.every((record) => (record.stage === "middle" || record.stage === "final") === (record.evoDetail !== null) || record.stage === null), "evolved records have a detail");
check(records.every((record) => record.stage !== null || record.evoMethods.length === 0), "no stage means no methods");
check(records.every((record) => record.moves.every((move) => MOVES.some((known) => known.id === move))), "unknown move id");
check(records.every((record) => record.abilities.every((ability) => ABILITIES.some((known) => known.id === ability))), "unknown ability id");
for (const move of MOVES) check(count((record) => record.moves.includes(move.id)) > 0, `no species learns ${move.name}`);
for (const ability of ABILITIES) check(count((record) => record.abilities.includes(ability.id)) > 0, `no species has ${ability.name}`);

// forms
const formCount = (predicate: (record: Record_) => boolean): number => formRecords.filter(predicate).length;
// (Roaming Form Gimmighoul is first stage like the Chest Form, so the builder
// files it as covered by its base; it is still an answer, by PokeDoku's list)
const EXPECTED_FORM_COUNT = 231;
check(
  formRecords.length === EXPECTED_FORM_COUNT,
  `form count ${formRecords.length} != ${EXPECTED_FORM_COUNT}`,
);
check(formRecords.every((record) => record.id >= 10000), "form ids must be PokeAPI form ids");
check(formRecords.every((record) => baseById.has(record.species)), "form without base species");
check(formCount((record) => record.flags.includes("mega")) === 96, "mega forms != 96 (all visible in PokeDoku)");
check(formCount((record) => record.flags.includes("gmax")) === 34, "gmax forms != 34 (all visible in PokeDoku)");
check(formCount((record) => record.stage === null) === 96 + 34 + 1, "no-stage forms = mega + gmax + Ash-Greninja (Eternamax adds nothing)");
const regional = (name: string) => (record: Record_): boolean => record.form?.startsWith(name) ?? false;
const only = (record: Record_, region: Region): boolean => record.region === region && record.regions.length === 1;
check(formCount(regional("Alola")) === 18, "alolan forms != 18");
check(formCount(regional("Galar")) === 20, "galarian forms != 20 (19 + Zen)");
check(formCount(regional("Hisui")) === 16, "hisuian forms != 16");
check(formCount(regional("Paldea")) === 4, "paldean forms != 4 (Tauros x3, Wooper)");
check(
  formRecords.filter(regional("Alola")).every((record) => only(record, "alola")) &&
    formRecords.filter(regional("Galar")).every((record) => only(record, "galar")) &&
    formRecords.filter(regional("Hisui")).every((record) => only(record, "hisui")) &&
    formRecords.filter(regional("Paldea")).every((record) => only(record, "paldea")),
  "regional forms must belong only to their region",
);
check(
  formRecords
    .filter((record) => record.flags.includes("mega") || record.flags.includes("gmax") || record.form === "Primal")
    .every((record) => same(record.regions, baseOf(record.species).regions)),
  "mega/gmax/primal forms must use the base regions",
);
check(
  formRecords
    .filter((record) => record.regions.length === 2)
    .every((record) => record.regions[0] === baseOf(record.species).region && record.regions[1] === record.region),
  "dual-region forms list base region then debut region",
);
check(formCount((record) => record.regions.length === 2) === 10, "dual-region forms != 10");
check(!formRecords.some((record) => record.form === "Primal" && record.flags.includes("mega")), "Primal is not Mega");
check(
  formRecords.filter((record) => record.flags.includes("mega") || record.flags.includes("gmax")).every((record) => !record.flags.includes("starter")),
  "mega/gmax forms are not first partners",
);
check(formRecords.filter((record) => record.flags.includes("gmax")).every((record) => record.moves.length === 0), "gmax forms have no moves");

// spot checks: species
check(same(get("alakazam").evoMethods, ["trade", "item"]), "Alakazam: trade and item (Linking Cord)");
check(get("alakazam").stage === "final", "Alakazam should be final");
check(same(get("vaporeon").evoMethods, ["item", "stone"]), "Vaporeon: item + stone");
check(same(get("eevee").evoMethods, []), "Eevee has no evo method");
check(get("eevee").branched, "Eevee is branched");
check(same(get("crobat").evoMethods, ["friendship", "level"]), "Crobat: friendship (and level)");
check(same(get("sylveon").evoMethods, ["friendship", "level"]), "Sylveon: friendship (and level)");
check(same(get("shedinja").evoMethods, ["level"]), "Shedinja: level (PokeAPI 'shed')");
check(same(get("steelix").evoMethods, ["trade", "item"]), "Steelix: trade + held item");
check(same(get("chansey").evoMethods, ["item", "level"]), "Chansey: held Oval Stone counts as item (and level)");
check(same(get("kingambit").evoMethods, ["level"]), "Kingambit: level, not item");
check(same(get("kleavor").evoMethods, ["item"]), "Kleavor: Black Augurite is an item, not a stone");
check(same(get("sirfetchd").evoMethods, []), "Sirfetch'd: no method");
check(get("scyther").branched && !get("rockruff").branched, "Scyther branched (Kleavor); Rockruff not (Lycanroc forms)");
check(!get("meowth").branched && get("slowpoke").branched, "Meowth not branched (Perrserker is Galarian); Slowpoke is");
check(get("farfetchd").stage === "single", "Kantonian Farfetch'd has no evolution line");
check(get("farfetchdgalar").stage === "first", "Galarian Farfetch'd is first stage");
check(get("basculin").stage === "single", "Red-Striped Basculin has no evolution line");
check(get("basculinwhitestriped").stage === "first", "White-Striped Basculin is first stage");
check(get("mrmime").stage === "final" && get("mrmimegalar").stage === "middle", "Mr. Mime final; Galarian middle");
check(get("linoone").stage === "final" && get("linoonegalar").stage === "middle", "Linoone final; Galarian middle");
check(get("meltan").stage === "first" && get("melmetal").stage === "final", "Meltan -> Melmetal");
check(get("meltan").region === null && same(get("meltan").regions, []), "Meltan has no region");
check(get("mew").stage === "single", "Mew should be single stage");
check(get("cosmog").stage === "first" && get("cosmoem").branched, "Cosmog first; Cosmoem branched");
check(get("solgaleo").stage === "final", "Solgaleo should be final");
check(get("wyrdeer").region === "hisui" && get("overqwil").region === "hisui", "Wyrdeer/Overqwil hisui");
check(get("toxtricity").region === "galar" && get("kingambit").region === "paldea", "Toxtricity galar, Kingambit paldea");
check(has(6, "starter") && !has(6, "mega") && !has(6, "gmax"), "Charizard: starter, but Mega/Gmax are the forms");
check(!has(25, "starter"), "Pikachu is not a starter");
check(has(1007, "paradox") && has(1007, "legendary"), "Koraidon flags");
check(has(772, "legendary"), "Type: Null is legendary");
check(has(489, "mythical"), "Phione is mythical");
check(get("nidoranf").displayName === "Nidoran♀", "Nidoran♀ display name");
check(get("charizard").moves.includes("earthquake") && !get("charizard").moves.includes("surf"), "Charizard learns Earthquake, not Surf");
check(get("pikachu").moves.includes("surf"), "Pikachu learns Surf");
check(get("gyarados").abilities.includes("intimidate"), "Gyarados has Intimidate");
check(get("gengar").abilities.length === 0, "Gengar lost Levitate");
check(same(get("gyarados").abilityList, [{ name: "Intimidate", hidden: false }, { name: "Moxie", hidden: true }]), "Gyarados abilities");
check(records.every((record) => record.abilityList.length >= 1), "every record has an ability");
check(get("rotomwash").moves.includes("hydropump") && get("rotomwash").moves.includes("thunderbolt"), "Rotom-Wash learns Hydro Pump and Thunderbolt");

// spot checks: forms
check(get("growlithe").region === "kanto", "Growlithe stays kanto");
check(same(get("growlithehisui").regions, ["hisui"]), "Hisuian Growlithe is Hisui only");
check(get("growlithehisui").stage === "first", "Hisuian Growlithe is first stage");
check(same(get("arcaninehisui").evoMethods, ["item", "stone"]), "Hisuian Arcanine by Fire Stone");
check(same(get("basculinwhitestriped").regions, ["unova", "hisui"]), "White-Striped Basculin counts for Unova and Hisui");
check(byDexId.get("basculinbluestriped")?.answer === false, "Blue-Striped Basculin adds nothing (display-only)");
check(same(get("dialgaorigin").regions, ["sinnoh", "hisui"]), "Origin Dialga: Sinnoh and Hisui");
check(same(get("ursalunabloodmoon").regions, ["hisui", "paldea"]), "Bloodmoon: Hisui and Paldea");
check(get("ursalunabloodmoon").stage === "single", "Bloodmoon Ursaluna has no evolution line");
check(same(get("hoopaunbound").regions, ["kalos", "hoenn"]), "Hoopa Unbound: Kalos and Hoenn (ORAS)");
check(same(get("deoxysattack").regions, ["hoenn", "kanto"]), "Deoxys Attack: Hoenn and Kanto (FRLG)");
check(byDexId.get("deoxysspeed")?.answer === false, "Deoxys Speed adds nothing (display-only)");
check(same(get("zygarde10").regions, ["kalos", "alola"]), "Zygarde 10%: Kalos and Alola");
check(same(get("groudonprimal").regions, ["hoenn"]), "Primal Groudon: Hoenn only");
check(same(get("raichualola").evoMethods, ["item", "stone"]) && get("raichualola").stage === "final", "Alolan Raichu");
check(same(get("persianalola").evoMethods, ["friendship", "level"]) && same(get("persian").evoMethods, ["level"]), "Persian vs Alolan Persian");
check(get("meowthgalar").stage === "first", "Galarian Meowth is first (Perrserker)");
check(get("slowpokegalar").branched, "Galarian Slowpoke is branched");
check(same(get("taurospaldeacombat").regions, ["paldea"]), "Paldean Tauros is paldea");
check(get("taurospaldeacombat").stage === "single", "Paldean Tauros has no evolution line");
check(get("gimmighoulroaming").stage === "first" && get("gimmighoul").stage === "first", "both Gimmighoul forms evolve");
check(same(get("gholdengo").otherPrevos, [FORM_IDS.gimmighoulroaming]) && get("gholdengo").prevo === 999, "Gholdengo evolves from both Gimmighoul forms");
check(same(get("mothim").otherPrevos, [FORM_IDS.burmysandy, FORM_IDS.burmytrash]) && get("mothim").prevo === 412, "Mothim evolves from any Burmy cloak");
check(get("floetteeternal").stage === "single", "Eternal Flower Floette has no evolution line");
check(get("floettemega").form === "Eternal-Mega", "Mega Floette belongs to Eternal Flower Floette");
check(same(get("charizardmegax").regions, ["kanto"]), "Mega Charizard X uses base region");
check(get("charizardmegax").types.includes("dragon"), "Mega Charizard X is Dragon");
check(same(get("charizardmegax").flags, ["mega"]), "Mega Charizard X: mega only (not starter)");
check(get("charizardmegax").stage === null && same(get("charizardmegax").evoMethods, []), "Mega forms have no evolution categories");
check(byDexId.has("charizardmegay"), "Mega Charizard Y is a record (it is the Mega answer)");
check(same(get("charizardgmax").flags, ["gmax"]) && same(get("charizardgmax").moves, []), "Gigantamax Charizard: gmax only, no moves");
check(get("charizardgmax").displayName === "Gigantamax Charizard", "gmax display name");
check(same(get("aerodactylmega").flags, ["fossil", "mega"]), "Mega Aerodactyl is still a fossil");
check(same(get("mewtwomegax").flags, ["legendary", "mega"]), "Mega Mewtwo X is still legendary");
check(has(FORM_IDS.articunogalar, "legendary"), "Galarian Articuno is legendary");
check(same(get("pikachustarter").flags, ["starter"]) && get("pikachustarter").stage === "single", "Partner Pikachu: starter, no evolution line");
check(same(get("pikachustarter").regions, ["kanto"]), "Partner Pikachu is Kanto");
check(same(get("typhlosionhisui").flags, ["starter"]), "Hisuian Typhlosion is a first partner");
check(same(get("greninjaash").flags, []) && get("greninjaash").stage === null, "Ash-Greninja: no starter, no stage");
check(same(get("darmanitangalarzen").evoMethods, ["item", "stone"]), "Galarian Zen inherits Galarian Darmanitan (Ice Stone)");
check(get("rotomwash").stage === "single", "Rotom-Wash inherits Rotom's stage");
check(get("growlithehisui").displayName === "Hisuian Growlithe", "form display name");
check(get("taurospaldeacombat").displayName === "Paldean Tauros (Combat)", "form display name 2");
check(get("charizardmegax").displayName === "Mega Charizard X", "form display name 3");

// ---- report -------------------------------------------------------------

const label = (predicate: (record: Record_) => boolean, name: string): void =>
  console.log(String(count(predicate)).padStart(5), name);
console.log(`@pkmn/dex ${dexVersion} — ${records.length} records (${baseRecords.length} species)\n`);
label((record) => record.types.length === 1, "mono-type");
label((record) => record.types.length === 2, "dual-type");
for (const method of ["level", "item", "stone", "trade", "friendship"] as const)
  label((record) => record.evoMethods.includes(method), `evolved by ${method}`);
label((record) => record.evoMethods.length === 0 && record.stage !== "first" && record.stage !== "single", "evolved by nothing we track");
for (const stage of ["first", "middle", "final", "single"] as const) label((record) => record.stage === stage, stage);
label((record) => record.branched, "branched");
for (const flag of ["legendary", "mythical", "ultraBeast", "paradox", "fossil", "starter", "baby"] as const)
  label((record) => record.flags.includes(flag), flag);
for (const move of MOVES) label((record) => record.moves.includes(move.id), `learns ${move.name}`);
for (const ability of ABILITIES) label((record) => record.abilities.includes(ability.id), `ability ${ability.name}`);

const taggedParadox = new Set(
  species.filter((entry) => entry.tags.includes("Paradox")).map((entry) => entry.num),
);
const untagged = [...PARADOX_IDS].filter((id) => !taggedParadox.has(id));
console.log(
  `\nparadox ids missing the dex tag (expected: DLC + Koraidon/Miraidon): ` +
    untagged.map((id) => byId.get(id)?.displayName ?? String(id)).join(", "),
);
console.log(
  `\n${formRecords.length} form records (${droppedForms.length} candidates dropped as covered by their base species):`,
);
for (const region of GEN_REGIONS.concat("hisui")) {
  const names = formRecords
    .filter((record) => record.regions.includes(region) && !record.flags.includes("mega") && !record.flags.includes("gmax"))
    .map((record) =>
      record.regions.length > 1
        ? `${record.displayName} (+${record.regions.filter((other) => other !== region).join(",")})`
        : record.displayName,
    );
  if (names.length) console.log(String(names.length).padStart(5), region + ":", names.join(", "));
}
console.log(`  plus ${formCount((record) => record.flags.includes("mega"))} Mega and ${formCount((record) => record.flags.includes("gmax"))} Gigantamax forms`);
console.log("display-only (answer: false):", droppedForms.map((record) => record.displayName).join(", "));
check(droppedForms.every((record) => record.answer === false && record.id >= 10000), "display-only forms flagged");

if (failures.length) {
  console.error("\nVALIDATION FAILED:");
  for (const failure of failures) console.error(" -", failure);
  process.exit(1);
}

const out: PokedexData = {
  meta: {
    source: "@pkmn/dex (Pokémon Showdown data)",
    sourceVersion: dexVersion,
    generatedAt: new Date().toISOString(),
    count: records.length,
    answerCount: baseRecords.length + formRecords.length,
    speciesCount: baseRecords.length,
  },
  // speciesName and altName are filled in by the app at load time
  pokemon: records as Pokemon[],
};
const outPath = join(dirname(fileURLToPath(import.meta.url)), "../src/data/pokedex.json");
writeFileSync(outPath, JSON.stringify(out, null, 1) + "\n");
console.log(`\nOK — wrote ${outPath}`);
