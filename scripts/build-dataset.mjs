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

// ---- evolution graph over base species ---------------------------------

const byName = new Map(species.map((s) => [s.name, s]));

// prevo can name a forme ("Basculin-White-Striped"); resolve to its base species
function parentOf(s) {
  if (!s.prevo) return null;
  const direct = byName.get(s.prevo);
  if (direct) return direct;
  const forme = Dex.species.get(s.prevo);
  return byName.get(forme.baseSpecies) || null;
}

const childrenOf = new Map();
for (const s of species) {
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

// Mega/Gmax come from forme entries; CAP formes (fan-made) are excluded
const megaSpecies = new Set();
const gmaxSpecies = new Set();
for (const s of all) {
  if (s.isNonstandard === "CAP") continue;
  if (/^Mega\b/.test(s.forme || "")) megaSpecies.add(s.baseSpecies);
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

const records = species.map((s) => {
  const gen = genOf(s.num);
  return {
    id: s.num,
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

// ---- validate -----------------------------------------------------------

const failures = [];
const check = (cond, msg) => {
  if (!cond) failures.push(msg);
};
const byId = new Map(records.map((r) => [r.id, r]));
const count = (pred) => records.filter(pred).length;
const has = (id, flag) => byId.get(id).flags.includes(flag);

check(records.length === MAX_NUM, `species count ${records.length} != ${MAX_NUM}`);
check(
  new Set(records.map((r) => r.id)).size === MAX_NUM,
  "duplicate or missing dex numbers"
);
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
check(count((r) => r.region === "hisui") === 7, "hisui != 7");
check(count((r) => r.flags.includes("gmax")) === 32, "gmax != 32");
check(count((r) => r.flags.includes("mega")) === 85, "mega != 85 (incl. Legends Z-A)");
check(count((r) => r.flags.includes("legendary")) === 71, "legendary != 71");
check(count((r) => r.flags.includes("mythical")) === 23, "mythical != 23");

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
  records.filter((r) => r.flags.includes("mega")).map((r) => r.displayName).join(", ")
);

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
  },
  pokemon: records,
};
const outPath = join(dirname(fileURLToPath(import.meta.url)), "../src/data/pokedex.json");
writeFileSync(outPath, JSON.stringify(out, null, 1) + "\n");
console.log(`\nOK — wrote ${outPath}`);
