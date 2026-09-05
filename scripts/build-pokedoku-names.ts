// Generates src/data/pokedoku-names.json: PokeDoku's own name slug for
// every record whose name carries a form ("zapdos-galar", and base species
// it names by their form like "lycanroc-midday"), from its public answer
// list, hidden forms flagged. The app shows names the way PokeDoku does,
// and a form is an answer exactly when PokeDoku shows it (pokedex.ts).
//
//   node scripts/build-pokedoku-names.ts

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PokedokuNamesData } from "../src/data/types.ts";
import { DATA_DIR, fetchPokedokuEntries, readPokedex } from "./pokedoku-api.ts";

const pokemon = readPokedex();
const entries = await fetchPokedokuEntries();
const byId = new Map(entries.filter((entry) => entry.id > 0).map((entry) => [entry.id, entry]));

// Records PokeDoku names under a different id than ours: its plain Zygarde
// (718, "zygarde-50") is hidden and the one it shows is the 50% Power
// Construct entry (10119, "zygarde-50%"), which the dataset folds into 718.
const ALIAS: Record<number, number> = { 718: 10119 };

const out: PokedokuNamesData = {};
let missing = 0;
for (const record of pokemon) {
  const entry = byId.get(ALIAS[record.id] ?? record.id);
  if (!entry) {
    if (record.form !== null) missing += 1;
    continue;
  }
  if (record.form === null && entry.name === entry.specie && !entry.hidden) continue; // a plain species: nothing to add
  out[record.id] = { name: entry.name, specie: entry.specie, ...(entry.hidden ? { hidden: true } : {}) };
}
writeFileSync(join(DATA_DIR, "pokedoku-names.json"), JSON.stringify(out));
console.log(`${Object.keys(out).length} names written, ${missing} form records without a PokeDoku entry`);
