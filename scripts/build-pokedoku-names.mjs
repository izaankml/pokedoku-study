// Generates src/data/pokedoku-names.json: PokeDoku's own name slug for every
// record whose name carries a form — the alternate forms ("zapdos-galar",
// "charizard-mega-x", "pikachu-partner") and the base species PokeDoku names
// by their form too ("lycanroc-midday", "toxtricity-amped", "meowstic-male")
// — fetched from its public answer list (which lists its hidden forms as
// well, flagged `hidden`). The app shows Pokémon the way PokeDoku does —
// species first, form after ("Zapdos Galar", not "Galarian Zapdos";
// "Lycanroc Midday") — so what you type here is what you'd type there; and
// a form is an answer in the app exactly when PokeDoku shows it (pokedex.js).
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
  const e = byId.get(p.id);
  if (!e) {
    if (p.form !== null) missing += 1;
    continue;
  }
  if (p.form === null && e.name === e.specie && !e.hidden) continue; // a plain species: nothing to add
  out[p.id] = { name: e.name, specie: e.specie, ...(e.hidden ? { hidden: true } : {}) };
}
writeFileSync(join(dataDir, "pokedoku-names.json"), JSON.stringify(out));
console.log(`${Object.keys(out).length} names written, ${missing} form records without a PokeDoku entry`);
