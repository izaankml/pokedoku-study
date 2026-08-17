// Compares the app's answers with PokeDoku's answer list: every entry
// PokeDoku shows should be an answer here (same PokeAPI / PokeDoku id) and
// nothing here should be an answer PokeDoku doesn't show. Known, accepted
// differences: PokeDoku's joke cowboy-hat Caterpie, and Zygarde 50%, which
// PokeDoku lists under its own id 10119 while the app uses the species (718).
//
//   node scripts/check-against-pokedoku.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const dataDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data");
const { pokemon } = JSON.parse(readFileSync(join(dataDir, "pokedex.json"), "utf8"));
const names = JSON.parse(readFileSync(join(dataDir, "pokedoku-names.json"), "utf8"));
const res = await fetch("https://api.pokedoku.com/api/pokemon/all", { headers: { "Accept-Language": "en" } });
if (!res.ok) throw new Error(`PokeDoku API ${res.status}`);
const entries = (await res.json()).filter((e) => e.id > 0);
const isAnswer = (p) => !p.form || (names[p.id] ? !names[p.id].hidden : p.answer !== false);
const KNOWN = new Set([99901, 10119, 718]);
const answers = new Map(pokemon.filter(isAnswer).map((p) => [p.id, p]));
const visible = entries.filter((e) => !e.hidden);
const missing = visible.filter((e) => !answers.has(e.id) && !KNOWN.has(e.id));
const extra = [...answers.values()].filter((p) => !visible.some((e) => e.id === p.id) && !KNOWN.has(p.id));
console.log(`${visible.length} visible on PokeDoku, ${answers.size} answers here`);
if (missing.length) console.log("PokeDoku shows, app lacks:", missing.map((e) => `${e.id}:${e.name}`).join(", "));
if (extra.length) console.log("app answers PokeDoku hides:", extra.map((p) => `${p.id}:${p.name}`).join(", "));
if (!missing.length && !extra.length) console.log("OK — the answers match");
process.exit(missing.length || extra.length ? 1 : 0);
