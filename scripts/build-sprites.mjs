// Generates src/data/sprites.json: for every record in pokedex.json, which
// sprite to show and where the Pokémon sits inside it.
//
// PokeDoku hosts its own 96×96 pixel sprites (keyed by PokeAPI id) — the
// art the player actually sees in the game, with truer colours than
// PokeAPI's fan sprites for Gen 6+ — so they come first, with PokeAPI as
// the fallback for the few ids PokeDoku lacks (Partner Pikachu/Eevee, which
// its own frontend remaps to the base species). Every sprite is decoded
// here to find its alpha bounding box, because PokeDoku's CDN sends no CORS
// headers and the app therefore can't measure them on a canvas at runtime
// (see src/components/Sprite.jsx).
//
//   node scripts/build-sprites.mjs         # ~1250 small fetches, cached in .cache/
//
// Output entry: [host, spriteId, x0, y0, bw, bh, w, h] where host is 0 for
// PokeDoku, 1 for PokeAPI, and the box is in sprite pixels.

import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { PNG } = require("pngjs");

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "src", "data");
const cacheDir = join(here, "..", ".cache", "sprites");
mkdirSync(cacheDir, { recursive: true });

const HOSTS = [
  (id) => `https://pokedoku-space.nyc3.cdn.digitaloceanspaces.com/resources/pokemon/${id}.png`,
  (id) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`,
];
const ALPHA_MIN = 32;

async function fetchPng(host, id) {
  const file = join(cacheDir, `${host}-${id}.png`);
  const miss = join(cacheDir, `${host}-${id}.miss`);
  if (existsSync(miss)) return null;
  if (existsSync(file)) return readFileSync(file);
  const res = await fetch(HOSTS[host](id));
  if (!res.ok) {
    writeFileSync(miss, "");
    return null;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(file, buf);
  return buf;
}

function boxOf(buf) {
  const png = PNG.sync.read(buf); // always RGBA out, palettes expanded
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

const { pokemon } = JSON.parse(readFileSync(join(dataDir, "pokedex.json"), "utf8"));
const out = {};
const counts = { pokedoku: 0, pokedokuBase: 0, pokeapi: 0, pokeapiBase: 0, none: 0 };
// a form with no sprite of its own anywhere: the closest form to stand in
// (Meowstic-F-Mega → the female Meowstic, not the species' male sprite)
const STAND_IN = { 10326: 10025 };
let done = 0;
for (const p of pokemon) {
  // own id on PokeDoku, then a stand-in, then base species on PokeDoku, then the same on PokeAPI
  const tries = [];
  for (const host of [0, 1]) {
    tries.push([host, p.id]);
    if (STAND_IN[p.id]) tries.push([host, STAND_IN[p.id]]);
    if (p.species !== p.id) tries.push([host, p.species]);
  }
  let entry = null;
  for (const [host, id] of tries) {
    const buf = await fetchPng(host, id);
    if (!buf) continue;
    const box = boxOf(buf);
    if (!box) continue;
    entry = [host, id, ...box];
    const key = host === 0 ? (id === p.id ? "pokedoku" : "pokedokuBase") : id === p.id ? "pokeapi" : "pokeapiBase";
    counts[key] += 1;
    break;
  }
  if (entry) out[p.id] = entry;
  else counts.none += 1;
  if (++done % 100 === 0) process.stderr.write(`${done}/${pokemon.length}\n`);
}

writeFileSync(join(dataDir, "sprites.json"), JSON.stringify(out));
console.log(counts);
