// PokeDoku's public answer list (api.pokedoku.com/api/pokemon/all): one
// entry per answer, keyed by PokeAPI id, hidden forms flagged. Shared by
// the scripts that build from it or check against it.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PokedexData, PokedokuNamesData, Pokemon } from "../src/data/types.ts";

export interface PokedokuEntry {
  // PokeAPI id (PokeDoku's own cosmetic entries use ids of 90000+)
  id: number;
  // the slug PokeDoku names it by ("lycanroc-midday")
  name: string;
  // the species slug ("lycanroc")
  specie: string;
  hidden?: boolean;
}

export async function fetchPokedokuEntries(): Promise<PokedokuEntry[]> {
  const response = await fetch("https://api.pokedoku.com/api/pokemon/all", { headers: { "Accept-Language": "en" } });
  if (!response.ok) throw new Error(`PokeDoku API ${response.status}`);
  return (await response.json()) as PokedokuEntry[];
}

export const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data");

export function readPokedex(): Pokemon[] {
  const data = JSON.parse(readFileSync(join(DATA_DIR, "pokedex.json"), "utf8")) as PokedexData;
  return data.pokemon;
}

export function readPokedokuNames(): PokedokuNamesData {
  return JSON.parse(readFileSync(join(DATA_DIR, "pokedoku-names.json"), "utf8")) as PokedokuNamesData;
}
