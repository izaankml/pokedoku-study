// Compares the app's answers with PokeDoku's answer list: every entry
// PokeDoku shows should be an answer here (same PokeAPI / PokeDoku id) and
// nothing here should be an answer PokeDoku doesn't show. Known, accepted
// difference: Zygarde 50%, which PokeDoku lists under its own id 10119
// while the app uses the species (718).
//
//   node scripts/check-against-pokedoku.ts
import type { Pokemon } from "../src/data/types.ts";
import { fetchPokedokuEntries, readPokedex, readPokedokuNames } from "./pokedoku-api.ts";

const pokemon = readPokedex();
const names = readPokedokuNames();
const entries = (await fetchPokedokuEntries()).filter((entry) => entry.id > 0);
const isAnswer = (record: Pokemon): boolean => {
  if (!record.form) return true;
  const named = names[record.id];
  return named ? !named.hidden : record.answer !== false;
};
const KNOWN = new Set([10119, 718]);
const answers = new Map(pokemon.filter(isAnswer).map((record) => [record.id, record]));
const visible = entries.filter((entry) => !entry.hidden);
const missing = visible.filter((entry) => !answers.has(entry.id) && !KNOWN.has(entry.id));
const extra = [...answers.values()].filter(
  (record) => !visible.some((entry) => entry.id === record.id) && !KNOWN.has(record.id),
);
console.log(`${visible.length} visible on PokeDoku, ${answers.size} answers here`);
if (missing.length) console.log("PokeDoku shows, app lacks:", missing.map((entry) => `${entry.id}:${entry.name}`).join(", "));
if (extra.length) console.log("app answers PokeDoku hides:", extra.map((record) => `${record.id}:${record.name}`).join(", "));
if (!missing.length && !extra.length) console.log("OK — the answers match");
process.exit(missing.length || extra.length ? 1 : 0);
