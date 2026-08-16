// Audits src/data/pokedex.json against pokedoku-helper.com's PokeAPI-derived
// per-entry data (the closest public proxy for PokeDoku's own categories).
// Prints every disagreement per field; exits 0 regardless — the two sources
// legitimately differ in a few places (see README). Needs network access.
//
//   node scripts/check-against-helper.mjs

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HELPER_DATA = "https://www.pokedoku-helper.com/data/pokemon.json";
const HELPER_MAPPING =
  "https://raw.githubusercontent.com/jlast/pokedoku-solver/main/packages/shared-types/src/pokemon-pokedoku-mapping.ts";

const here = dirname(fileURLToPath(import.meta.url));
const ours = JSON.parse(readFileSync(join(here, "../src/data/pokedex.json"), "utf8")).pokemon;
const ourById = new Map(ours.map((p) => [p.id, p]));
const ourBase = new Map(ours.filter((p) => p.form === null).map((p) => [p.species, p]));

const helper = await (await fetch(HELPER_DATA)).json();
const mappingSrc = await (await fetch(HELPER_MAPPING)).text();
// helper formId (PokeAPI pokemon-form id) -> PokeDoku id (PokeAPI pokemon id)
const toPokedokuId = new Map();
for (const m of mappingSrc.matchAll(/^\s*(\d+):\s*(\d+),/gm)) {
  toPokedokuId.set(Number(m[2]), Number(m[1]));
}
// PokeDoku's base Zygarde is the 50% Power Construct entry
toPokedokuId.set(718, 718);

const STAGE = {
  "First Stage": "first",
  "Middle Stage": "middle",
  "Final Stage": "final",
  "No Evolution Line": "single",
};
const TRIGGER = {
  "Evolved by Level": "level",
  "Evolved by Item": "item",
  "Evolved by Trade": "trade",
  "Evolved by Friendship": "friendship",
};
const FLAG = {
  Legendary: "legendary",
  Mythical: "mythical",
  "Ultra Beast": "ultraBeast",
  Paradox: "paradox",
  Fossil: "fossil",
  "First Partner": "starter",
  Baby: "baby",
  Gigantamax: "gmax",
  "Mega Evolution": "mega",
};
const moveId = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

const sorted = (xs) => [...xs].sort();
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

const diffs = {};
const note = (field, label, theirs, mine) => {
  (diffs[field] ||= []).push(`${label}: helper ${JSON.stringify(theirs)} vs ours ${JSON.stringify(mine)}`);
};

let compared = 0;
const notCovered = [];
for (const h of helper) {
  const pdId = toPokedokuId.get(h.formId) ?? h.formId;
  const label = `${h.name} (#${pdId})`;
  const theirs = {
    types: h.types.map((t) => t.toLowerCase()),
    regions: (h.region || []).map((r) => r.toLowerCase()),
    stage: STAGE[h.evolutionStage] ?? null,
    evoMethods: (h.evolutionTrigger || []).map((t) => TRIGGER[t]),
    branched: Boolean(h.isBranched),
    flags: (h.categories || []).map((c) => FLAG[c]),
    moves: (h.learnedMoves || []).map(moveId),
    abilities: (h.abilities || []).map(moveId),
  };
  const mine = ourById.get(pdId);
  if (!mine) {
    // We deliberately drop forms covered by their base species; make sure
    // the helper agrees they add nothing.
    const base = ourBase.get(h.id);
    if (!base) {
      notCovered.push(`${label}: no record at all`);
      continue;
    }
    const subset = (a, b) => a.every((x) => b.includes(x));
    const extra = [];
    if (!subset(theirs.types, base.types) || theirs.types.length !== base.types.length) extra.push("types");
    if (!subset(theirs.regions, base.regions)) extra.push("regions");
    if (theirs.stage !== null && theirs.stage !== base.stage) extra.push("stage");
    if (!subset(theirs.evoMethods, base.evoMethods)) extra.push("evoMethods");
    if (theirs.branched && !base.branched) extra.push("branched");
    if (!subset(theirs.flags, base.flags)) extra.push("flags");
    if (!subset(theirs.moves, base.moves)) extra.push("moves");
    if (!subset(theirs.abilities, base.abilities)) extra.push("abilities");
    if (extra.length) notCovered.push(`${label}: helper says it adds ${extra.join(", ")} over ${base.displayName}`);
    continue;
  }
  compared++;
  if (!same(theirs.types, mine.types)) note("types", label, theirs.types, mine.types);
  if (!same(theirs.regions, mine.regions)) note("regions", label, theirs.regions, mine.regions);
  if (theirs.stage !== mine.stage) note("stage", label, theirs.stage, mine.stage);
  const mineMethods = mine.evoMethods.filter((m) => m !== "stone"); // helper has no stone category
  if (!same(theirs.evoMethods, mineMethods)) note("evoMethods", label, theirs.evoMethods, mineMethods);
  if (theirs.branched !== mine.branched) note("branched", label, theirs.branched, mine.branched);
  if (!same(theirs.flags, mine.flags)) note("flags", label, theirs.flags, mine.flags);
  // helper tracks 21 moves; ignore ours it doesn't know (Dragon Rage)
  const helperMoves = new Set(["acrobatics", "brickbreak", "calmmind", "closecombat", "crunch", "dazzlinggleam", "earthquake", "flamethrower", "fly", "hydropump", "icebeam", "icepunch", "metronome", "protect", "psychic", "razorleaf", "shadowball", "surf", "sludgebomb", "tailslap", "thunderbolt"]);
  const mineMoves = mine.moves.filter((m) => helperMoves.has(m));
  if (!same(theirs.moves, mineMoves)) {
    const missing = theirs.moves.filter((m) => !mineMoves.includes(m));
    const extra = mineMoves.filter((m) => !theirs.moves.includes(m));
    note("moves", label, missing.length ? `+${missing.join(",")}` : "", extra.length ? `+${extra.join(",")}` : "");
  }
  if (!same(theirs.abilities, mine.abilities)) note("abilities", label, theirs.abilities, mine.abilities);
}

console.log(`compared ${compared} of ${helper.length} helper entries against ${ours.length} records\n`);
for (const [field, rows] of Object.entries(diffs)) {
  console.log(`== ${field}: ${rows.length} disagreement(s)`);
  for (const r of rows) console.log("   " + r);
}
console.log(`\n== helper entries we don't carry that it thinks add something: ${notCovered.length}`);
for (const r of notCovered) console.log("   " + r);
