// Audits src/data/pokedex.json against pokedoku-helper.com's PokeAPI-derived
// per-entry data (the closest public proxy for PokeDoku's own categories).
// Prints every disagreement per field and exits 0 regardless, since the two
// sources legitimately differ in a few places (see README). Needs network.
//
//   node scripts/check-against-helper.ts

import type { EvoMethod, Flag, Stage } from "../src/data/types.ts";
import { readPokedex } from "./pokedoku-api.ts";

const HELPER_DATA = "https://www.pokedoku-helper.com/data/pokemon.json";
const HELPER_MAPPING =
  "https://raw.githubusercontent.com/jlast/pokedoku-solver/main/packages/shared-types/src/pokemon-pokedoku-mapping.ts";

// One pokedoku-helper.com entry, as far as this audit reads it.
interface HelperEntry {
  // PokeAPI species id
  id: number;
  // PokeAPI pokemon-form id
  formId: number;
  name: string;
  types: string[];
  region?: string[];
  evolutionStage?: string;
  evolutionTrigger?: string[];
  isBranched?: boolean;
  categories?: string[];
  learnedMoves?: string[];
  abilities?: string[];
}

const ours = readPokedex();
const ourById = new Map(ours.map((record) => [record.id, record]));
const ourBase = new Map(ours.filter((record) => record.form === null).map((record) => [record.species, record]));

const helper = (await (await fetch(HELPER_DATA)).json()) as HelperEntry[];
const mappingSource = await (await fetch(HELPER_MAPPING)).text();
// helper formId (PokeAPI pokemon-form id) -> PokeDoku id (PokeAPI pokemon id)
const toPokedokuId = new Map<number, number>();
for (const match of mappingSource.matchAll(/^\s*(\d+):\s*(\d+),/gm)) {
  toPokedokuId.set(Number(match[2]), Number(match[1]));
}
// PokeDoku's base Zygarde is the 50% Power Construct entry
toPokedokuId.set(718, 718);

const STAGE: Record<string, Stage> = {
  "First Stage": "first",
  "Middle Stage": "middle",
  "Final Stage": "final",
  "No Evolution Line": "single",
};
const TRIGGER: Record<string, EvoMethod> = {
  "Evolved by Level": "level",
  "Evolved by Item": "item",
  "Evolved by Trade": "trade",
  "Evolved by Friendship": "friendship",
};
const FLAG: Record<string, Flag> = {
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
const moveId = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, "");

const sorted = <T>(items: readonly T[]): T[] => [...items].sort();
const same = <T>(a: readonly T[], b: readonly T[]): boolean => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

const diffs: Record<string, string[]> = {};
const note = (field: string, label: string, theirs: unknown, mine: unknown): void => {
  (diffs[field] ||= []).push(`${label}: helper ${JSON.stringify(theirs)} vs ours ${JSON.stringify(mine)}`);
};

let compared = 0;
const notCovered: string[] = [];
for (const entry of helper) {
  const pokedokuId = toPokedokuId.get(entry.formId) ?? entry.formId;
  const label = `${entry.name} (#${pokedokuId})`;
  const theirs = {
    types: entry.types.map((type) => type.toLowerCase()),
    regions: (entry.region || []).map((region) => region.toLowerCase()),
    stage: STAGE[entry.evolutionStage ?? ""] ?? null,
    evoMethods: (entry.evolutionTrigger || []).map((trigger) => TRIGGER[trigger]),
    branched: Boolean(entry.isBranched),
    flags: (entry.categories || []).map((category) => FLAG[category]),
    moves: (entry.learnedMoves || []).map(moveId),
    abilities: (entry.abilities || []).map(moveId),
  };
  const mine = ourById.get(pokedokuId);
  if (!mine) {
    // forms covered by their base species have no record; check the
    // helper agrees they add nothing
    const base = ourBase.get(entry.id);
    if (!base) {
      notCovered.push(`${label}: no record at all`);
      continue;
    }
    const subset = <T>(a: readonly T[], b: readonly T[]): boolean => a.every((item) => b.includes(item));
    const extra: string[] = [];
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
  const mineMethods = mine.evoMethods.filter((method) => method !== "stone"); // helper has no stone category
  if (!same(theirs.evoMethods, mineMethods)) note("evoMethods", label, theirs.evoMethods, mineMethods);
  if (theirs.branched !== mine.branched) note("branched", label, theirs.branched, mine.branched);
  if (!same(theirs.flags, mine.flags)) note("flags", label, theirs.flags, mine.flags);
  // helper tracks 21 moves; ignore ours it doesn't know (Dragon Rage)
  const helperMoves = new Set(["acrobatics", "brickbreak", "calmmind", "closecombat", "crunch", "dazzlinggleam", "earthquake", "flamethrower", "fly", "hydropump", "icebeam", "icepunch", "metronome", "protect", "psychic", "razorleaf", "shadowball", "surf", "sludgebomb", "tailslap", "thunderbolt"]);
  const mineMoves = mine.moves.filter((move) => helperMoves.has(move));
  if (!same(theirs.moves, mineMoves)) {
    const missing = theirs.moves.filter((move) => !mineMoves.includes(move));
    const extra = mineMoves.filter((move) => !theirs.moves.includes(move));
    note("moves", label, missing.length ? `+${missing.join(",")}` : "", extra.length ? `+${extra.join(",")}` : "");
  }
  if (!same(theirs.abilities, mine.abilities)) note("abilities", label, theirs.abilities, mine.abilities);
}

console.log(`compared ${compared} of ${helper.length} helper entries against ${ours.length} records\n`);
for (const [field, rows] of Object.entries(diffs)) {
  console.log(`== ${field}: ${rows.length} disagreement(s)`);
  for (const row of rows) console.log("   " + row);
}
console.log(`\n== helper entries we don't carry that it thinks add something: ${notCovered.length}`);
for (const row of notCovered) console.log("   " + row);
