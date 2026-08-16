// Generates src/data/pokedex.json from @pkmn/dex (Pokémon Showdown's data).
//
// @pkmn/dex is NOT a dependency of this project (it is ~50 MB installed).
// Install it anywhere and point this script at that installation:
//
//   npm install --no-save @pkmn/dex
//   npm run build-data            # looks in ./node_modules
//   node scripts/build-dataset.mjs /some/dir/with/node_modules
//
// The script validates the generated data against known-good counts and
// spot checks, and exits non-zero if anything is off. To audit the result
// against pokedoku-helper.com's PokeAPI-derived data, run
// scripts/check-against-helper.mjs afterwards.
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
  DISPLAY_NAME_OVERRIDES,
} from "./manual-lists.mjs";
import { MOVES, ABILITIES } from "../src/data/traits.js";

const searchRoot = process.argv[2] || process.cwd();
const requireFrom = createRequire(join(searchRoot, "noop.js"));
const { Dex } = requireFrom("@pkmn/dex");
const dexVersion = requireFrom("@pkmn/dex/package.json").version;

const MAX_NUM = 1025;
// National dex number of the last species of each generation
const GEN_ENDS = [151, 251, 386, 493, 649, 721, 809, 905, 1025];
const GEN_REGIONS = [
  "kanto", "johto", "hoenn", "sinnoh", "unova", "kalos", "alola", "galar", "paldea",
];
const EXPECTED_GEN_COUNTS = [151, 100, 135, 107, 156, 72, 88, 96, 120];

const genOf = (num) => GEN_ENDS.findIndex((end) => num <= end) + 1;

const all = Dex.species.all();
const species = all
  .filter((s) => s.num >= 1 && s.num <= MAX_NUM && !s.forme && !s.isNonstandard)
  .concat(
    // "Past" species (not in the current games' dex) are still real species
    all.filter(
      (s) => s.num >= 1 && s.num <= MAX_NUM && !s.forme && s.isNonstandard === "Past"
    )
  )
  .sort((a, b) => a.num - b.num);

// Alternate forms (regional variants, Megas, Rotom appliances, ...). Only
// those in FORM_IDS become records, but the whole set takes part in the
// evolution graph so form-to-form links (Growlithe-Hisui -> Arcanine-Hisui)
// resolve.
const formes = all
  .filter((s) => s.num >= 1 && s.num <= MAX_NUM && s.forme && s.isNonstandard !== "CAP")
  .sort((a, b) => a.num - b.num);

const REGIONAL_ADJECTIVE = {
  Alola: "Alolan",
  Galar: "Galarian",
  Hisui: "Hisuian",
  Paldea: "Paldean",
};
const isRegionalForme = (s) => s.forme.split("-")[0] in REGIONAL_ADJECTIVE;
// The dex's isMega flag is missing on some Legends Z-A formes ("Mega-Z",
// "M-Mega"), so go by the forme name.
const isMegaForme = (s) => /(^|-)Mega(-|$)/.test(s.forme || "");
const isGmaxForme = (s) => /(^|-)Gmax$/.test(s.forme || "");
const isPrimalForme = (s) => s.forme === "Primal";
const isPartnerForme = (s) => s.forme === "Starter"; // Let's Go partners
// Forms PokeDoku gives no evolution categories at all
const hasNoEvolution = (s) =>
  isMegaForme(s) || isGmaxForme(s) || s.forme === "Ash" || s.forme === "Eternamax";

// ---- evolution graph ----------------------------------------------------
//
// One graph over species + forms. A form's parent is whatever the dex names
// (Sirfetch'd <- Farfetch'd-Galar), so a base species whose only evolution
// belongs to a regional form (Kantonian Farfetch'd, Corsola, Qwilfish, Red-
// Striped Basculin) has no evolution line — which is how PokeDoku sees it.

const pool = species.concat(formes);
const byName = new Map(pool.map((s) => [s.name, s]));

function parentOf(s) {
  const prevoName = PREVO_OVERRIDES[s.id] || s.prevo;
  if (!prevoName) return null;
  const parent = byName.get(prevoName);
  if (!parent) throw new Error(`unknown prevo "${prevoName}" for ${s.name}`);
  return parent;
}

const childrenOf = new Map();
for (const s of pool) {
  const parent = parentOf(s);
  if (parent) {
    if (!childrenOf.has(parent.name)) childrenOf.set(parent.name, []);
    childrenOf.get(parent.name).push(s);
  }
}

function stageOf(s) {
  const hasParent = parentOf(s) !== null;
  const hasChildren = childrenOf.has(s.name);
  if (!hasParent && !hasChildren) return "single";
  if (!hasParent) return "first";
  if (hasChildren) return "middle";
  return "final";
}

// "Branched: a pre-evo that can evolve into completely different Pokémon
// (excluding forms of the same Pokémon)" — so Rockruff (three Lycanroc
// forms) is not branched, Scyther (Scizor or Kleavor) is.
function isBranched(s) {
  const kids = childrenOf.get(s.name) || [];
  return new Set(kids.map((k) => k.num)).size >= 2;
}

// ---- evolution methods --------------------------------------------------

const EVO_STONES = new Set([
  "Fire Stone", "Water Stone", "Thunder Stone", "Leaf Stone", "Moon Stone",
  "Sun Stone", "Shiny Stone", "Dusk Stone", "Dawn Stone", "Ice Stone",
]);

// Every method the Pokémon counts for. "stone" is a subset of "item": a
// used (not held) evolution stone.
function evoMethodsOf(s) {
  if (EVO_METHOD_OVERRIDES[s.id]) return EVO_METHOD_OVERRIDES[s.id];
  if (!parentOf(s)) return [];
  switch (s.evoType) {
    case undefined:
    case "levelExtra":
    case "levelMove":
      return ["level"];
    case "levelFriendship":
      return ["friendship", "level"];
    case "useItem":
      return EVO_STONES.has(s.evoItem) ? ["item", "stone"] : ["item"];
    case "levelHold":
      return ["item", "level"];
    case "trade":
      return s.evoItem ? ["trade", "item"] : ["trade"];
    case "other":
      throw new Error(`"other" evolution needs an EVO_METHOD_OVERRIDES entry: ${s.name}`);
    default:
      throw new Error(`unmapped evoType "${s.evoType}" on ${s.name}`);
  }
}

// The item an item evolution needs (used, held, or held while trading).
function evoItemOf(s, methods) {
  if (!methods.includes("item")) return null;
  const item = EVO_ITEM_OVERRIDES[s.id] || s.evoItem || null;
  if (!item) throw new Error(`item evolution without an item: ${s.name}`);
  return item;
}

const withArticle = (item) => (/^(a |an )/.test(item) ? item : `${/^[aeiou]/i.test(item) ? "an" : "a"} ${item}`);
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

// How it evolves, in words: "Level 36", "Use a Water Stone", "Level up
// holding a Razor Claw at night", "High friendship during the day", ...
function evoDetailOf(s, methods, item) {
  if (!parentOf(s)) return null;
  if (EVO_DETAIL_OVERRIDES[s.id]) return EVO_DETAIL_OVERRIDES[s.id];
  const cond = s.evoCondition ? ` ${s.evoCondition}` : "";
  switch (s.evoType) {
    case undefined:
      return s.evoLevel ? `Level ${s.evoLevel}${cond}` : `Level up${cond}`;
    case "levelMove":
      return `Level up knowing ${s.evoMove}${cond}`;
    case "levelExtra":
      return `Level up${cond}`;
    case "levelFriendship":
      return `High friendship${cond}`;
    case "useItem":
      return `Use ${withArticle(item)}${cond}`;
    case "levelHold":
      return `Level up holding ${withArticle(item)}${cond}`;
    case "trade":
      return item ? `Trade holding ${withArticle(item)}` : `Trade${cond}`;
    case "other":
      if (methods.length === 0 && !s.evoCondition) return null;
      return cap(s.evoCondition);
    default:
      return null;
  }
}

// ---- moves & abilities --------------------------------------------------

const MOVE_IDS = MOVES.map((m) => {
  const move = Dex.moves.get(m.name);
  if (!move.exists) throw new Error(`unknown move ${m.name}`);
  return [m.id, move.id];
});
const ABILITY_NAMES = new Map(ABILITIES.map((a) => [a.name, a.id]));

const learnsetCache = new Map();
async function ownLearnset(s) {
  if (!learnsetCache.has(s.id)) {
    const ls = await Dex.learnsets.get(s.id);
    learnsetCache.set(s.id, ls?.learnset || null);
  }
  return learnsetCache.get(s.id);
}

// Union of the learnsets along the "changes from" chain (Rotom-Wash learns
// what Rotom does plus Hydro Pump); a form with no learnset of its own (Mega,
// cosmetic) uses its base. Event-only sources ("5S0") don't count.
async function learnableMoves(s) {
  const learnable = new Set();
  let cur = s;
  const seen = new Set();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    const ls = await ownLearnset(cur);
    if (ls) {
      for (const [id, dexId] of MOVE_IDS) {
        if (ls[dexId]?.some((src) => !/^\dS/.test(src))) learnable.add(id);
      }
    }
    if (cur.changesFrom) cur = Dex.species.get(cur.changesFrom);
    else if (!ls && cur.forme) cur = Dex.species.get(cur.baseSpecies);
    else break;
  }
  return MOVES.map((m) => m.id).filter((id) => learnable.has(id));
}

function abilitiesOf(s) {
  const own = Object.values(s.abilities || {});
  const names = own.length ? own : Object.values(Dex.species.get(s.baseSpecies).abilities);
  return ABILITIES.map((a) => a.id).filter((id) =>
    names.some((n) => ABILITY_NAMES.get(n) === id)
  );
}

// ---- flags --------------------------------------------------------------

// Starters: expand base forms to their whole evolution lines (species only)
const starterIds = new Set();
for (const s of species) {
  if (!STARTER_BASE_IDS.has(s.num)) continue;
  const queue = [s];
  while (queue.length) {
    const cur = queue.pop();
    starterIds.add(cur.num);
    queue.push(...(childrenOf.get(cur.name) || []).filter((c) => !c.forme));
  }
}

const isLegendary = (s) =>
  s.tags.includes("Sub-Legendary") || s.tags.includes("Restricted Legendary");

function speciesFlags(s) {
  const flags = [];
  if (isLegendary(s)) flags.push("legendary");
  if (s.tags.includes("Mythical")) flags.push("mythical");
  if (ULTRA_BEAST_IDS.has(s.num)) flags.push("ultraBeast");
  if (PARADOX_IDS.has(s.num)) flags.push("paradox");
  if (FOSSIL_IDS.has(s.num)) flags.push("fossil");
  if (starterIds.has(s.num)) flags.push("starter");
  if (BABY_IDS.has(s.num)) flags.push("baby");
  return flags;
}

// Forms inherit the species-level flags. First partner only carries over to
// regional forms (Hisuian Typhlosion) and the Let's Go partners — not to
// Mega/Gigantamax forms or Ash-Greninja (PokeDoku's lists).
function formFlags(s, base) {
  const flags = base.flags.filter((f) => f !== "starter" || isRegionalForme(s));
  if (isPartnerForme(s)) flags.push("starter");
  if (isLegendary(s) && !flags.includes("legendary")) flags.push("legendary");
  if (s.tags.includes("Mythical") && !flags.includes("mythical")) flags.push("mythical");
  if (isMegaForme(s)) flags.push("mega");
  if (isGmaxForme(s)) flags.push("gmax");
  return flags;
}

// ---- regions ------------------------------------------------------------

function speciesRegion(s) {
  if (NO_REGION_IDS.has(s.num)) return null;
  return HISUI_IDS.has(s.num) ? "hisui" : GEN_REGIONS[genOf(s.num) - 1];
}

// `region` is where the form debuted; `regions` is every region category it
// counts for (see the header comment).
function formRegion(s, base) {
  if (isMegaForme(s) || isGmaxForme(s) || isPrimalForme(s) || isPartnerForme(s)) {
    return { gen: base.gen, region: base.region, regions: base.regions };
  }
  const gen = s.gen;
  let region = FORM_DEBUT_REGION_OVERRIDES[s.id];
  if (!region) {
    const hisui =
      gen === 8 &&
      (s.forme.startsWith("Hisui") || HISUI_IDS.has(s.num) || HISUI_FORM_IDS.has(s.id));
    region = hisui ? "hisui" : GEN_REGIONS[gen - 1];
  }
  const regions =
    isRegionalForme(s) || region === base.region || base.region === null
      ? [region]
      : [base.region, region];
  return { gen, region, regions };
}

// ---- names --------------------------------------------------------------

function formDisplayName(s) {
  if (DISPLAY_NAME_OVERRIDES[s.id]) return DISPLAY_NAME_OVERRIDES[s.id];
  const base = DISPLAY_NAME_OVERRIDES[Dex.species.get(s.baseSpecies).id] || s.baseSpecies;
  const parts = s.forme.split("-");
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

const baseRecords = [];
for (const s of species) {
  const region = speciesRegion(s);
  baseRecords.push({
    id: s.num,
    species: s.num,
    form: null,
    name: s.id,
    displayName: DISPLAY_NAME_OVERRIDES[s.id] || s.name,
    types: s.types.map((t) => t.toLowerCase()),
    gen: genOf(s.num),
    region,
    regions: region ? [region] : [],
    stage: stageOf(s),
    evoMethods: evoMethodsOf(s),
    evoItem: evoItemOf(s, evoMethodsOf(s)),
    evoDetail: evoDetailOf(s, evoMethodsOf(s), evoItemOf(s, evoMethodsOf(s))),
    branched: isBranched(s),
    flags: speciesFlags(s),
    moves: await learnableMoves(s),
    abilities: abilitiesOf(s),
  });
}
const baseById = new Map(baseRecords.map((r) => [r.id, r]));

// Stage/methods for a form: from the evolution graph when it takes part in
// one (Growlithe-Hisui, Wormadam-Sandy); otherwise inherited from the form
// it changes from (Zen Darmanitan-Galar <- Darmanitan-Galar, Rotom-Wash <-
// Rotom). A form with neither (Bloodmoon Ursaluna, Paldean Tauros, Partner
// Pikachu) is its own single-stage line.
const evoCache = new Map();
function formEvolution(s) {
  if (evoCache.has(s.id)) return evoCache.get(s.id);
  let result;
  const none = { stage: "single", evoMethods: [], evoItem: null, evoDetail: null, branched: false };
  if (hasNoEvolution(s)) {
    result = { ...none, stage: null };
  } else if (parentOf(s) || childrenOf.has(s.name)) {
    const evoMethods = evoMethodsOf(s);
    const evoItem = evoItemOf(s, evoMethods);
    result = {
      stage: stageOf(s),
      evoMethods,
      evoItem,
      evoDetail: evoDetailOf(s, evoMethods, evoItem),
      branched: isBranched(s),
    };
  } else if (s.changesFrom) {
    const from = Dex.species.get(s.changesFrom);
    result = from.forme
      ? formEvolution(from)
      : (({ stage, evoMethods, evoItem, evoDetail, branched }) => ({ stage, evoMethods, evoItem, evoDetail, branched }))(
          baseById.get(s.num)
        );
  } else {
    result = none;
  }
  evoCache.set(s.id, result);
  return result;
}

// A form only earns a record if it can answer some cell its base species
// cannot: a type the base lacks, a different type count, region, stage,
// method, flag, move or ability. Otherwise the base record already covers it.
function coversNothingNew(form, base) {
  const subset = (a, b) => a.every((x) => b.includes(x));
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

const candidateForms = formes.filter((s) => s.id in FORM_IDS);
const droppedForms = [];
const formRecords = [];
for (const s of candidateForms) {
  const base = baseById.get(s.num);
  const record = {
    id: FORM_IDS[s.id],
    species: s.num,
    form: s.forme,
    name: s.id,
    displayName: formDisplayName(s),
    types: s.types.map((t) => t.toLowerCase()),
    ...formRegion(s, base),
    ...formEvolution(s),
    flags: formFlags(s, base),
    moves: isGmaxForme(s) ? [] : await learnableMoves(s),
    abilities: abilitiesOf(s),
  };
  if (coversNothingNew(record, base)) droppedForms.push(record);
  else formRecords.push(record);
}

// Base species first, then its forms, in dex order.
const records = baseRecords
  .concat(formRecords)
  .sort((a, b) => a.species - b.species || (a.form === null ? -1 : b.form === null ? 1 : 0));

// ---- validate -----------------------------------------------------------

const failures = [];
const check = (cond, msg) => {
  if (!cond) failures.push(msg);
};
const byId = new Map(records.map((r) => [r.id, r]));
const byDexId = new Map(records.map((r) => [r.name, r]));
const get = (name) => {
  const r = byDexId.get(name);
  if (!r) failures.push(`missing record ${name}`);
  return r || {};
};
// Base-species counts (forms are validated separately below)
const count = (pred) => baseRecords.filter(pred).length;
const has = (id, flag) => byId.get(id).flags.includes(flag);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

check(baseRecords.length === MAX_NUM, `species count ${baseRecords.length} != ${MAX_NUM}`);
check(new Set(records.map((r) => r.id)).size === records.length, "duplicate ids");
check(new Set(records.map((r) => r.name)).size === records.length, "duplicate names");
for (let g = 1; g <= 9; g++) {
  const n = count((r) => r.gen === g);
  check(
    n === EXPECTED_GEN_COUNTS[g - 1],
    `gen ${g} count ${n} != ${EXPECTED_GEN_COUNTS[g - 1]}`
  );
}
check(new Set(records.flatMap((r) => r.types)).size === 18, "expected exactly 18 types");
check(records.every((r) => r.types.length >= 1 && r.types.length <= 2), "bad types length");
check(count((r) => r.flags.includes("ultraBeast")) === 11, "ultra beasts != 11");
check(count((r) => r.flags.includes("paradox")) === 22, "paradox != 22");
check(count((r) => r.flags.includes("fossil")) === 25, "fossil != 25");
check(count((r) => r.flags.includes("starter")) === 81, "starter != 81");
check(count((r) => r.flags.includes("baby")) === 19, "baby != 19");
check(count((r) => r.flags.includes("legendary")) === 71, "legendary != 71");
check(count((r) => r.flags.includes("mythical")) === 23, "mythical != 23");
check(count((r) => r.flags.includes("mega") || r.flags.includes("gmax")) === 0, "species carry no mega/gmax");
check(count((r) => r.region === "hisui") === 7, "hisui species != 7");
check(count((r) => r.region === null) === 2, "species without a region != 2 (Meltan, Melmetal)");
check(
  records.every((r) => (r.region === null ? r.regions.length === 0 : r.regions.includes(r.region))),
  "regions must contain region"
);
check(records.every((r) => r.regions.length <= 2), "at most two regions");
check(baseRecords.every((r) => r.regions.length <= 1), "species have at most one region");
check(count((r) => r.branched) === 15, "branched species != 15");
check(count((r) => r.stage === "single") === 205, "single-stage species != 205");
check(count((r) => r.evoMethods.includes("stone")) === 44, "stone evolutions != 44");
check(records.every((r) => !r.evoMethods.includes("stone") || r.evoMethods.includes("item")), "stone implies item");
check(records.every((r) => r.evoMethods.includes("item") === (r.evoItem !== null)), "item evolutions name their item");
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
check(records.every((r) => (r.stage === "middle" || r.stage === "final") === (r.evoDetail !== null) || r.stage === null), "evolved records have a detail");
check(records.every((r) => r.stage !== null || r.evoMethods.length === 0), "no stage means no methods");
check(records.every((r) => r.moves.every((m) => MOVES.some((x) => x.id === m))), "unknown move id");
check(records.every((r) => r.abilities.every((a) => ABILITIES.some((x) => x.id === a))), "unknown ability id");
for (const m of MOVES) check(count((r) => r.moves.includes(m.id)) > 0, `no species learns ${m.name}`);
for (const a of ABILITIES) check(count((r) => r.abilities.includes(a.id)) > 0, `no species has ${a.name}`);

// forms
const formCount = (pred) => formRecords.filter(pred).length;
const EXPECTED_FORM_COUNT = 232;
check(
  formRecords.length === EXPECTED_FORM_COUNT,
  `form count ${formRecords.length} != ${EXPECTED_FORM_COUNT}`
);
check(formRecords.every((r) => r.id >= 10000), "form ids must be PokeAPI form ids");
check(formRecords.every((r) => baseById.has(r.species)), "form without base species");
check(formCount((r) => r.flags.includes("mega")) === 96, "mega forms != 96 (all visible in PokeDoku)");
check(formCount((r) => r.flags.includes("gmax")) === 34, "gmax forms != 34 (all visible in PokeDoku)");
check(formCount((r) => r.stage === null) === 96 + 34 + 1, "no-stage forms = mega + gmax + Ash-Greninja (Eternamax adds nothing)");
const regional = (name) => (r) => r.form.startsWith(name);
const only = (r, region) => r.region === region && r.regions.length === 1;
check(formCount(regional("Alola")) === 18, "alolan forms != 18");
check(formCount(regional("Galar")) === 20, "galarian forms != 20 (19 + Zen)");
check(formCount(regional("Hisui")) === 16, "hisuian forms != 16");
check(formCount(regional("Paldea")) === 4, "paldean forms != 4 (Tauros x3, Wooper)");
check(
  formRecords.filter(regional("Alola")).every((r) => only(r, "alola")) &&
    formRecords.filter(regional("Galar")).every((r) => only(r, "galar")) &&
    formRecords.filter(regional("Hisui")).every((r) => only(r, "hisui")) &&
    formRecords.filter(regional("Paldea")).every((r) => only(r, "paldea")),
  "regional forms must belong only to their region"
);
check(
  formRecords
    .filter((r) => r.flags.includes("mega") || r.flags.includes("gmax") || r.form === "Primal")
    .every((r) => same(r.regions, baseById.get(r.species).regions)),
  "mega/gmax/primal forms must use the base regions"
);
check(
  formRecords
    .filter((r) => r.regions.length === 2)
    .every((r) => r.regions[0] === baseById.get(r.species).region && r.regions[1] === r.region),
  "dual-region forms list base region then debut region"
);
check(formCount((r) => r.regions.length === 2) === 10, "dual-region forms != 10");
check(!formRecords.some((r) => r.form === "Primal" && r.flags.includes("mega")), "Primal is not Mega");
check(
  formRecords.filter((r) => r.flags.includes("mega") || r.flags.includes("gmax")).every((r) => !r.flags.includes("starter")),
  "mega/gmax forms are not first partners"
);
check(formRecords.filter((r) => r.flags.includes("gmax")).every((r) => r.moves.length === 0), "gmax forms have no moves");

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
check(get("rotomwash").moves.includes("hydropump") && get("rotomwash").moves.includes("thunderbolt"), "Rotom-Wash learns Hydro Pump and Thunderbolt");

// spot checks: forms
check(get("growlithe").region === "kanto", "Growlithe stays kanto");
check(same(get("growlithehisui").regions, ["hisui"]), "Hisuian Growlithe is Hisui only");
check(get("growlithehisui").stage === "first", "Hisuian Growlithe is first stage");
check(same(get("arcaninehisui").evoMethods, ["item", "stone"]), "Hisuian Arcanine by Fire Stone");
check(same(get("basculinwhitestriped").regions, ["unova", "hisui"]), "White-Striped Basculin counts for Unova and Hisui");
check(!byDexId.has("basculinbluestriped"), "Blue-Striped Basculin adds nothing (dropped)");
check(same(get("dialgaorigin").regions, ["sinnoh", "hisui"]), "Origin Dialga: Sinnoh and Hisui");
check(same(get("ursalunabloodmoon").regions, ["hisui", "paldea"]), "Bloodmoon: Hisui and Paldea");
check(get("ursalunabloodmoon").stage === "single", "Bloodmoon Ursaluna has no evolution line");
check(same(get("hoopaunbound").regions, ["kalos", "hoenn"]), "Hoopa Unbound: Kalos and Hoenn (ORAS)");
check(same(get("deoxysattack").regions, ["hoenn", "kanto"]), "Deoxys Attack: Hoenn and Kanto (FRLG)");
check(!byDexId.has("deoxysspeed"), "Deoxys Speed adds nothing (dropped)");
check(same(get("zygarde10").regions, ["kalos", "alola"]), "Zygarde 10%: Kalos and Alola");
check(same(get("groudonprimal").regions, ["hoenn"]), "Primal Groudon: Hoenn only");
check(same(get("raichualola").evoMethods, ["item", "stone"]) && get("raichualola").stage === "final", "Alolan Raichu");
check(same(get("persianalola").evoMethods, ["friendship", "level"]) && same(get("persian").evoMethods, ["level"]), "Persian vs Alolan Persian");
check(get("meowthgalar").stage === "first", "Galarian Meowth is first (Perrserker)");
check(get("slowpokegalar").branched, "Galarian Slowpoke is branched");
check(same(get("taurospaldeacombat").regions, ["paldea"]), "Paldean Tauros is paldea");
check(get("taurospaldeacombat").stage === "single", "Paldean Tauros has no evolution line");
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

const label = (pred, name) => console.log(String(count(pred)).padStart(5), name);
console.log(`@pkmn/dex ${dexVersion} — ${records.length} records (${baseRecords.length} species)\n`);
label((r) => r.types.length === 1, "mono-type");
label((r) => r.types.length === 2, "dual-type");
for (const m of ["level", "item", "stone", "trade", "friendship"])
  label((r) => r.evoMethods.includes(m), `evolved by ${m}`);
label((r) => r.evoMethods.length === 0 && r.stage !== "first" && r.stage !== "single", "evolved by nothing we track");
for (const st of ["first", "middle", "final", "single"]) label((r) => r.stage === st, st);
label((r) => r.branched, "branched");
for (const f of ["legendary", "mythical", "ultraBeast", "paradox", "fossil", "starter", "baby"])
  label((r) => r.flags.includes(f), f);
for (const m of MOVES) label((r) => r.moves.includes(m.id), `learns ${m.name}`);
for (const a of ABILITIES) label((r) => r.abilities.includes(a.id), `ability ${a.name}`);

const taggedParadox = new Set(
  species.filter((s) => s.tags.includes("Paradox")).map((s) => s.num)
);
const untagged = [...PARADOX_IDS].filter((id) => !taggedParadox.has(id));
console.log(
  `\nparadox ids missing the dex tag (expected: DLC + Koraidon/Miraidon): ` +
    untagged.map((id) => byId.get(id).displayName).join(", ")
);
console.log(
  `\n${formRecords.length} form records (${droppedForms.length} candidates dropped as covered by their base species):`
);
for (const region of GEN_REGIONS.concat("hisui")) {
  const names = formRecords
    .filter((r) => r.regions.includes(region) && !r.flags.includes("mega") && !r.flags.includes("gmax"))
    .map((r) => (r.regions.length > 1 ? `${r.displayName} (+${r.regions.filter((x) => x !== region)})` : r.displayName));
  if (names.length) console.log(String(names.length).padStart(5), region + ":", names.join(", "));
}
console.log(`  plus ${formCount((r) => r.flags.includes("mega"))} Mega and ${formCount((r) => r.flags.includes("gmax"))} Gigantamax forms`);
console.log("dropped:", droppedForms.map((r) => r.displayName).join(", "));

if (failures.length) {
  console.error("\nVALIDATION FAILED:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

const out = {
  meta: {
    source: "@pkmn/dex (Pokémon Showdown data)",
    sourceVersion: dexVersion,
    generatedAt: new Date().toISOString().slice(0, 10),
    count: records.length,
    speciesCount: baseRecords.length,
  },
  pokemon: records,
};
const outPath = join(dirname(fileURLToPath(import.meta.url)), "../src/data/pokedex.json");
writeFileSync(outPath, JSON.stringify(out, null, 1) + "\n");
console.log(`\nOK — wrote ${outPath}`);
