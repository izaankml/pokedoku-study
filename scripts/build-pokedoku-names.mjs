// Generates src/data/pokedoku-names.json: PokeDoku's own name slug for every
// alternate-form record ("zapdos-galar", "charizard-mega-x", "pikachu-partner"),
// fetched from its public answer list. The app shows forms the way PokeDoku
// does — species first, form after ("Zapdos Galar", not "Galarian Zapdos") —
// so what you type here is what you'd type there.
//
//   node scripts/build-pokedoku-names.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "src", "data");
const { pokemon } = JSON.parse(readFileSync(join(dataDir, "pokedex.json"), "utf8"));

const res = await fetch("https://api.pokedoku.com/api/pokemon/all", { headers: { "Accept-Language": "en" } });
if (!res.ok) throw new Error(`PokeDoku API ${res.status}`);
const entries = await res.json();
const byId = new Map(entries.filter((e) => e.id > 0).map((e) => [e.id, e]));

const out = {};
let missing = 0;
for (const p of pokemon) {
  if (p.form === null) continue;
  const e = byId.get(p.id);
  if (!e) {
    missing += 1;
    continue;
  }
  out[p.id] = { name: e.name, specie: e.specie };
}
writeFileSync(join(dataDir, "pokedoku-names.json"), JSON.stringify(out));
console.log(`${Object.keys(out).length} form names written, ${missing} form records without a PokeDoku entry`);
