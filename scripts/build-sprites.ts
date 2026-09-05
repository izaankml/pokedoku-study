// Generates src/data/sprites.json: for every record in pokedex.json, which
// sprite to show and where the Pokémon sits inside it.
//
// PokeDoku's own sprites (the art the player sees in the game, keyed by
// PokeAPI id) come first, with PokeAPI's as the fallback. Every sprite is
// decoded here to find its alpha bounding box, because PokeDoku's CDN
// sends no CORS headers and the app can't measure them at runtime (see
// src/components/Sprite.tsx).
//
//   node scripts/build-sprites.ts         # fetches are cached in .cache/
//
// Output entry: [host, spriteId, x0, y0, bw, bh, w, h] where host is 0 for
// PokeDoku, 1 for PokeAPI, and the box is in sprite pixels.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import type { SpriteEntry, SpritesData } from "../src/data/types.ts";
import { DATA_DIR, readPokedex } from "./pokedoku-api.ts";

const here = dirname(fileURLToPath(import.meta.url));
const cacheDir = join(here, "..", ".cache", "sprites");
mkdirSync(cacheDir, { recursive: true });

const HOSTS: ReadonlyArray<(id: number) => string> = [
  (id) => `https://pokedoku-space.nyc3.cdn.digitaloceanspaces.com/resources/pokemon/${id}.png`,
  (id) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`,
];
const ALPHA_MIN = 32;

async function fetchPng(host: number, id: number): Promise<Buffer | null> {
  const file = join(cacheDir, `${host}-${id}.png`);
  const miss = join(cacheDir, `${host}-${id}.miss`);
  if (existsSync(miss)) return null;
  if (existsSync(file)) return readFileSync(file);
  const response = await fetch(HOSTS[host](id));
  if (!response.ok) {
    writeFileSync(miss, "");
    return null;
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(file, buffer);
  return buffer;
}

// [x0, y0, bw, bh, w, h]: the alpha bounding box inside a w×h sprite
type Box = [number, number, number, number, number, number];

function boxOf(buffer: Buffer): Box | null {
  const png = PNG.sync.read(buffer); // always RGBA out, palettes expanded
  const { width: w, height: h, data } = png;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > ALPHA_MIN) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 >= x0 ? [x0, y0, x1 - x0 + 1, y1 - y0 + 1, w, h] : null;
}

const pokemon = readPokedex();
const out: SpritesData = {};
const counts = { pokedoku: 0, pokedokuBase: 0, pokeapi: 0, pokeapiBase: 0, none: 0 };
type CountKey = keyof typeof counts;
// a form with no sprite of its own anywhere: the closest form to stand in
const STAND_IN: Record<number, number> = {};
// PokeDoku draws these in a rendered style rather than pixel art, and
// PokeAPI's pixel sprite exists: Ash-Greninja, Own Tempo Rockruff
const PREFER_POKEAPI = new Set<number>([10117, 10151]);
let done = 0;
for (const record of pokemon) {
  // own id on PokeDoku, then a stand-in, then base species on PokeDoku, then the same on PokeAPI
  const tries: [host: number, id: number][] = [];
  for (const host of PREFER_POKEAPI.has(record.id) ? [1, 0] : [0, 1]) {
    tries.push([host, record.id]);
    if (STAND_IN[record.id]) tries.push([host, STAND_IN[record.id]]);
    if (record.species !== record.id) tries.push([host, record.species]);
  }
  let entry: SpriteEntry | null = null;
  for (const [host, id] of tries) {
    const buffer = await fetchPng(host, id);
    if (!buffer) continue;
    const box = boxOf(buffer);
    if (!box) continue;
    entry = [host, id, ...box];
    const key: CountKey = host === 0 ? (id === record.id ? "pokedoku" : "pokedokuBase") : id === record.id ? "pokeapi" : "pokeapiBase";
    counts[key] += 1;
    break;
  }
  if (entry) out[record.id] = entry;
  else counts.none += 1;
  if (++done % 100 === 0) process.stderr.write(`${done}/${pokemon.length}\n`);
}

writeFileSync(join(DATA_DIR, "sprites.json"), JSON.stringify(out));
console.log(counts);
