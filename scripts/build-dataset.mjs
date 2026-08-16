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
// spot checks, and exits non-zero if anything is off.

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
  FORM_IDS,
  EVO_METHOD_OVERRIDES,
  DISPLAY_NAME_OVERRIDES,
} from "./manual-lists.mjs";

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

// ---- evolution graph ----------------------------------------------------

// Two graphs: one over base species only (a base record's stage ignores
// forms, so Kantonian Farfetch'd stays "first" via Sirfetch'd), and one over
// species + forms for the form records themselves.
function makeGraph(pool) {
  const byName = new Map(pool.map((s) => [s.name, s]));

  // prevo can name a forme outside the pool ("Basculin-White-Striped" for
  // the base-only graph); resolve to its base species
  function parentOf(s) {
    if (!s.prevo) return null;
    const direct = byName.get(s.prevo);
    if (direct) return direct;
    const forme = Dex.species.get(s.prevo);
    return byName.get(forme.baseSpecies) || null;
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

  return { parentOf, childrenOf, stageOf };
}

const baseGraph = makeGraph(species);
const fullGraph = makeGraph(species.concat(formes));
const { childrenOf, stageOf } = baseGraph;

// ---- evolution method ---------------------------------------------------

const EVO_TYPE_MAP = {
  trade: "trade",
  useItem: "item",
  levelFriendship: "friendship",
  levelMove: "level",
  levelExtra: "level",
  levelHold: "level",
  other: "other",
};

function evoMethodOf(s) {
  if (EVO_METHOD_OVERRIDES[s.id]) return EVO_METHOD_OVERRIDES[s.id];
  if (!s.prevo) return null;
  if (!s.evoType) return "level"; // plain level-up
  const mapped = EVO_TYPE_MAP[s.evoType];
  if (!mapped) throw new Error(`unmapped evoType "${s.evoType}" on ${s.name}`);
  return mapped;
}

// ---- flags --------------------------------------------------------------

// Mega/Gmax come from forme entries; CAP formes (fan-made) are excluded.
// The dex's isMega flag is missing on some Legends Z-A formes ("Mega-Z",
// "M-Mega"), so go by the forme name.
const isMegaForme = (s) => /(^|-)Mega(-|$)/.test(s.forme || "");
const megaSpecies = new Set();
const gmaxSpecies = new Set();
for (const s of all) {
  if (s.isNonstandard === "CAP") continue;
  if (isMegaForme(s)) megaSpecies.add(s.baseSpecies);
  if (s.forme === "Gmax") gmaxSpecies.add(s.baseSpecies);
}

// Starters: expand base forms to their whole evolution lines
const starterIds = new Set();
for (const s of species) {
  if (!STARTER_BASE_IDS.has(s.num)) continue;
  const queue = [s];
  while (queue.length) {
    const cur = queue.pop();
    starterIds.add(cur.num);
    queue.push(...(childrenOf.get(cur.name) || []));
  }
}

function flagsOf(s) {
  const flags = [];
  if (s.tags.includes("Sub-Legendary") || s.tags.includes("Restricted Legendary"))
    flags.push("legendary");
  if (s.tags.includes("Mythical")) flags.push("mythical");
  if (ULTRA_BEAST_IDS.has(s.num)) flags.push("ultraBeast");
  if (PARADOX_IDS.has(s.num)) flags.push("paradox");
  if (FOSSIL_IDS.has(s.num)) flags.push("fossil");
  if (starterIds.has(s.num)) flags.push("starter");
  if (BABY_IDS.has(s.num)) flags.push("baby");
  if (megaSpecies.has(s.name)) flags.push("mega");
  if (gmaxSpecies.has(s.name)) flags.push("gmax");
  return flags;
}

// ---- assemble -----------------------------------------------------------

const baseRecords = species.map((s) => {
  const gen = genOf(s.num);
  return {
    id: s.num,
    species: s.num,
    form: null,
    name: s.id,
    displayName: DISPLAY_NAME_OVERRIDES[s.id] || s.name,
    types: s.types.map((t) => t.toLowerCase()),
    gen,
    region: HISUI_IDS.has(s.num) ? "hisui" : GEN_REGIONS[gen - 1],
    stage: stageOf(s),
    evoMethod: evoMethodOf(s),
    flags: flagsOf(s),
  };
});
const baseById = new Map(baseRecords.map((r) => [r.id, r]));

// ---- alternate forms ----------------------------------------------------
//
// A form belongs to the region it was introduced in (Hisuian Growlithe is
// Hisui, White-Striped Basculin is Hisui, Bloodmoon Ursaluna is Paldea),
// which is what PokeDoku does ("Pokémon must originate from this region").
// The two exceptions are also PokeDoku's: Mega (and Primal) forms use the
// base form's region, as do Gigantamax forms (which have no records here).

const REGIONAL_ADJECTIVE = {
  Alola: "Alolan",
  Galar: "Galarian",
  Hisui: "Hisuian",
  Paldea: "Paldean",
};

const isMegaLike = (s) => isMegaForme(s) || s.forme === "Primal";

function formDisplayName(s) {
  if (DISPLAY_NAME_OVERRIDES[s.id]) return DISPLAY_NAME_OVERRIDES[s.id];
  const base = DISPLAY_NAME_OVERRIDES[Dex.species.get(s.baseSpecies).id] || s.baseSpecies;
  const parts = s.forme.split("-");
  if (parts[0] === "Mega" || parts[0] === "Primal") {
    return [parts[0], base, ...parts.slice(1)].join(" ");
  }
  const adjective = REGIONAL_ADJECTIVE[parts[0]];
  if (adjective) {
    const rest = parts.slice(1).join(" ");
    return rest ? `${adjective} ${base} (${rest})` : `${adjective} ${base}`;
  }
  return `${base} (${parts.join(" ")})`;
}

function formRegion(s) {
  const baseRecord = baseById.get(s.num);
  if (isMegaLike(s)) return { gen: baseRecord.gen, region: baseRecord.region };
  const gen = s.gen;
  const hisui =
    gen === 8 &&
    (s.forme.startsWith("Hisui") || HISUI_IDS.has(s.num) || HISUI_FORM_IDS.has(s.id));
  return { gen, region: hisui ? "hisui" : GEN_REGIONS[gen - 1] };
}

// Stage/method for a form: from the evolution graph when the form takes
// part in one (Growlithe-Hisui, Wormadam-Sandy); otherwise inherited from
// the form it changes from (Zen Darmanitan-Galar <- Darmanitan-Galar) or,
// failing that, from the base species (Mega Charizard <- Charizard,
// Bloodmoon Ursaluna <- Ursaluna).
const evoCache = new Map();
function formEvolution(s) {
  if (evoCache.has(s.id)) return evoCache.get(s.id);
  let result;
  if (s.prevo || fullGraph.childrenOf.has(s.name)) {
    result = { stage: fullGraph.stageOf(s), evoMethod: evoMethodOf(s) };
  } else {
    const from = s.changesFrom ? Dex.species.get(s.changesFrom) : null;
    if (from && from.forme && from.num === s.num) {
      result = formEvolution(from);
    } else {
      const baseRecord = baseById.get(s.num);
      result = { stage: baseRecord.stage, evoMethod: baseRecord.evoMethod };
    }
  }
  evoCache.set(s.id, result);
  return result;
}

function formFlags(s) {
  const baseFlags = baseById.get(s.num).flags;
  const flags = [];
  const legendary =
    s.tags.includes("Sub-Legendary") || s.tags.includes("Restricted Legendary");
  if (legendary || baseFlags.includes("legendary")) flags.push("legendary");
  if (s.tags.includes("Mythical") || baseFlags.includes("mythical")) flags.push("mythical");
  for (const f of ["ultraBeast", "paradox", "fossil", "starter", "baby"]) {
    if (baseFlags.includes(f)) flags.push(f);
  }
  if (isMegaForme(s)) flags.push("mega");
  if (s.canGigantamax) flags.push("gmax");
  return flags;
}

// A form only earns a record if it can answer some cell its base species
// cannot: a type the base lacks, a different type count, region, stage,
// method, or flag. Otherwise the base record already covers it.
function coversNothingNew(form, base) {
  const subset = (a, b) => a.every((x) => b.includes(x));
  return (
    subset(form.types, base.types) &&
    form.types.length === base.types.length &&
    form.region === base.region &&
    form.stage === base.stage &&
    form.evoMethod === base.evoMethod &&
    subset(form.flags, base.flags)
  );
}

const candidateForms = formes.filter((s) => s.id in FORM_IDS);
const droppedForms = [];
const formRecords = [];
for (const s of candidateForms) {
  const record = {
    id: FORM_IDS[s.id],
    species: s.num,
    form: s.forme,
    name: s.id,
    displayName: formDisplayName(s),
    types: s.types.map((t) => t.toLowerCase()),
    ...formRegion(s),
    ...formEvolution(s),
    flags: formFlags(s),
  };
  if (coversNothingNew(record, baseById.get(s.num))) droppedForms.push(record);
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
const byName = new Map(records.map((r) => [r.name, r]));
// Base-species counts (forms are validated separately below)
const count = (pred) => baseRecords.filter(pred).length;
const has = (id, flag) => byId.get(id).flags.includes(flag);

check(baseRecords.length === MAX_NUM, `species count ${baseRecords.length} != ${MAX_NUM}`);
check(
  new Set(records.map((r) => r.id)).size === records.length,
  "duplicate ids"
);
check(new Set(records.map((r) => r.name)).size === records.length, "duplicate names");
for (let g = 1; g <= 9; g++) {
  const n = count((r) => r.gen === g);
  check(
    n === EXPECTED_GEN_COUNTS[g - 1],
    `gen ${g} count ${n} != ${EXPECTED_GEN_COUNTS[g - 1]}`
  );
}
check(
  new Set(records.flatMap((r) => r.types)).size === 18,
  "expected exactly 18 types"
);
check(records.every((r) => r.types.length >= 1 && r.types.length <= 2), "bad types length");
check(count((r) => r.flags.includes("ultraBeast")) === 11, "ultra beasts != 11");
check(count((r) => r.flags.includes("paradox")) === 22, "paradox != 22");
check(count((r) => r.flags.includes("fossil")) === 25, "fossil != 25");
check(count((r) => r.flags.includes("starter")) === 81, "starter != 81");
check(count((r) => r.flags.includes("baby")) === 19, "baby != 19");
check(count((r) => r.region === "hisui") === 7, "hisui species != 7");
check(count((r) => r.flags.includes("gmax")) === 32, "gmax != 32");
check(count((r) => r.flags.includes("mega")) === 87, "mega != 87 (incl. Legends Z-A)");
check(count((r) => r.flags.includes("legendary")) === 71, "legendary != 71");
check(count((r) => r.flags.includes("mythical")) === 23, "mythical != 23");

// forms
const EXPECTED_FORM_COUNT = 113;
check(
  formRecords.length === EXPECTED_FORM_COUNT,
  `form count ${formRecords.length} != ${EXPECTED_FORM_COUNT}`
);
check(formRecords.every((r) => r.id >= 10000), "form ids must be PokeAPI form ids");
check(formRecords.every((r) => baseById.has(r.species)), "form without base species");
const formCount = (pred) => formRecords.filter(pred).length;
const regional = (name) => (r) => r.form.startsWith(name);
check(formCount(regional("Alola")) === 18, "alolan forms != 18");
check(formCount(regional("Galar")) === 20, "galarian forms != 20 (19 + Zen)");
check(formCount(regional("Hisui")) === 16, "hisuian forms != 16");
check(formCount(regional("Paldea")) === 4, "paldean forms != 4 (Tauros x3, Wooper)");
check(
  formRecords.filter(regional("Alola")).every((r) => r.region === "alola") &&
    formRecords.filter(regional("Galar")).every((r) => r.region === "galar") &&
    formRecords.filter(regional("Hisui")).every((r) => r.region === "hisui") &&
    formRecords.filter(regional("Paldea")).every((r) => r.region === "paldea"),
  "regional forms must belong to their region"
);
check(
  formRecords.filter((r) => /(^|-)Mega(-|$)/.test(r.form) || r.form === "Primal")
    .every((r) => r.region === baseById.get(r.species).region),
  "mega/primal forms must use the base region"
);

// spot checks
check(byId.get(65).evoMethod === "trade", "Alakazam should be trade");
check(byId.get(65).stage === "final", "Alakazam should be final");
check(byId.get(134).evoMethod === "item", "Vaporeon should be item");
check(byId.get(133).evoMethod === null, "Eevee should have no evo method");
check(byId.get(169).evoMethod === "friendship", "Crobat should be friendship");
check(byId.get(700).evoMethod === "friendship", "Sylveon should be friendship");
check(byId.get(292).evoMethod === "other", "Shedinja should be other");
check(byId.get(899).region === "hisui", "Wyrdeer should be hisui");
check(byId.get(904).region === "hisui", "Overqwil should be hisui");
check(byId.get(58).region === "kanto", "Growlithe stays kanto");
check(byName.get("growlithehisui").region === "hisui", "Hisuian Growlithe is hisui");
check(byName.get("growlithehisui").stage === "first", "Hisuian Growlithe is first stage");
check(byName.get("arcaninehisui").evoMethod === "item", "Hisuian Arcanine by item");
check(byId.get(550).region === "unova", "Basculin (Red-Striped) stays unova");
check(byName.get("basculinwhitestriped").region === "hisui", "White-Striped Basculin is hisui");
check(!byName.has("basculinbluestriped"), "Blue-Striped Basculin adds nothing (dropped)");
check(byName.get("dialgaorigin").region === "hisui", "Origin Dialga is hisui");
check(byName.get("ursalunabloodmoon").region === "paldea", "Bloodmoon Ursaluna is paldea");
check(byName.get("raichualola").evoMethod === "item", "Alolan Raichu by item");
check(byName.get("raichualola").stage === "final", "Alolan Raichu is final");
check(byName.get("meowthgalar").stage === "first", "Galarian Meowth is first (Perrserker)");
check(byName.get("mrmimegalar").stage === "middle", "Galarian Mr. Mime is middle");
check(byName.get("taurospaldeacombat").region === "paldea", "Paldean Tauros is paldea");
check(byName.get("charizardmegax").region === "kanto", "Mega Charizard X uses base region");
check(byName.get("charizardmegax").types.includes("dragon"), "Mega Charizard X is Dragon");
check(has(FORM_IDS.charizardmegax, "mega") && has(FORM_IDS.charizardmegax, "starter"), "Mega Charizard X flags");
check(!byName.has("charizardmegay"), "Mega Charizard Y adds nothing (dropped)");
check(byName.get("groudonprimal").region === "hoenn", "Primal Groudon uses base region");
check(has(FORM_IDS.articunogalar, "legendary"), "Galarian Articuno is legendary");
check(byName.get("zygarde10").region === "alola", "Zygarde 10% debuted in Alola");
check(byName.get("darmanitangalarzen").evoMethod === "item", "Galarian Zen inherits Galarian Darmanitan");
check(byName.get("rotomwash").stage === "single", "Rotom-Wash inherits Rotom's stage");
check(byName.get("growlithehisui").displayName === "Hisuian Growlithe", "form display name");
check(byName.get("taurospaldeacombat").displayName === "Paldean Tauros (Combat)", "form display name 2");
check(byName.get("charizardmegax").displayName === "Mega Charizard X", "form display name 3");
check(byId.get(849).region === "galar", "Toxtricity should be galar");
check(byId.get(983).region === "paldea", "Kingambit should be paldea");
check(has(6, "starter") && has(6, "mega") && has(6, "gmax"), "Charizard flags");
check(!has(25, "starter"), "Pikachu is not a starter");
check(has(1007, "paradox") && has(1007, "legendary"), "Koraidon flags");
check(has(772, "legendary"), "Type: Null is legendary");
check(has(489, "mythical"), "Phione is mythical");
check(byId.get(29).displayName === "Nidoran♀", "Nidoran♀ display name");
check(byId.get(151).stage === "single", "Mew should be single stage");
check(byId.get(789).stage === "first", "Cosmog should be first");
check(byId.get(791).stage === "final", "Solgaleo should be final");

// ---- report -------------------------------------------------------------

const label = (pred, name) => console.log(String(count(pred)).padStart(5), name);
console.log(`@pkmn/dex ${dexVersion} — ${records.length} species\n`);
label((r) => r.types.length === 1, "mono-type");
label((r) => r.types.length === 2, "dual-type");
for (const m of ["level", "item", "trade", "friendship", "other"])
  label((r) => r.evoMethod === m, `evolved by ${m}`);
for (const st of ["first", "middle", "final", "single"]) label((r) => r.stage === st, st);
for (const f of [
  "legendary", "mythical", "ultraBeast", "paradox", "fossil", "starter", "baby", "mega", "gmax",
])
  label((r) => r.flags.includes(f), f);

const taggedParadox = new Set(
  species.filter((s) => s.tags.includes("Paradox")).map((s) => s.num)
);
const untagged = [...PARADOX_IDS].filter((id) => !taggedParadox.has(id));
console.log(
  `\nparadox ids missing the dex tag (expected: DLC + Koraidon/Miraidon): ` +
    untagged.map((id) => byId.get(id).displayName).join(", ")
);
console.log(
  "mega species:",
  baseRecords.filter((r) => r.flags.includes("mega")).map((r) => r.displayName).join(", ")
);
console.log(
  `\n${formRecords.length} form records (${droppedForms.length} candidates dropped as covered by their base species):`
);
for (const region of GEN_REGIONS.concat("hisui")) {
  const names = formRecords.filter((r) => r.region === region).map((r) => r.displayName);
  if (names.length) console.log(String(names.length).padStart(5), region + ":", names.join(", "));
}
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
