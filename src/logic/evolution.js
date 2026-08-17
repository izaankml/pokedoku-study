// Evolution lines, drawn from each record's `prevo` (the record it evolved
// from). A line is a list of levels — [[Eevee], [Vaporeon, Jolteon, …]] —
// walked from the root of whatever line the Pokémon belongs to. Mega,
// Gigantamax and the other transformations (forms.js) have no evolution
// of their own, so they show their base's line.

import { ALL_POKEMON, POKEMON_BY_ID } from "../data/pokedex.js";
import { baseOf } from "./forms.js";

const childrenOf = new Map();
for (const p of ALL_POKEMON) {
  if (p.prevo === null || p.prevo === undefined) continue;
  if (!childrenOf.has(p.prevo)) childrenOf.set(p.prevo, []);
  childrenOf.get(p.prevo).push(p);
}
// dex order: by species number, forms after their base (a form's own id
// is beyond the dex, so Wormadam Sandy would otherwise trail Mothim)
for (const kids of childrenOf.values()) kids.sort((a, b) => a.species - b.species || a.id - b.id);

// The root of the line a Pokémon belongs to, and the record to highlight
// (the Pokémon itself, or what it's a transformation of — Charizard for
// Mega Charizard X; see forms.js).
function rootOf(pokemon) {
  let focus = baseOf(pokemon);
  if (focus.stage === null && focus.species !== focus.id) focus = POKEMON_BY_ID.get(focus.species) || focus;
  let root = focus;
  const seen = new Set([root.id]);
  while (root.prevo !== null && root.prevo !== undefined && POKEMON_BY_ID.has(root.prevo) && !seen.has(root.prevo)) {
    root = POKEMON_BY_ID.get(root.prevo);
    seen.add(root.id);
  }
  return { root, focus };
}

// { root, focusId } — root is a node { pokemon, children: node[] } (in
// dex order), so each Pokémon is joined to its own evolutions: Sliggoo →
// Goodra and Hisuian Sliggoo → Hisuian Goodra are two chains under Goomy,
// not one branch of four. Null when the Pokémon doesn't evolve at all.
export function evolutionTree(pokemon) {
  const { root, focus } = rootOf(pokemon);
  if (!childrenOf.has(root.id)) return null;
  const node = (p) => ({ pokemon: p, children: (childrenOf.get(p.id) || []).map(node) });
  return { root: node(root), focusId: focus.id };
}

// { levels, focusId } — the same line as arrays of records per stage,
// root first. Null when the Pokémon doesn't evolve at all.
export function evolutionLine(pokemon) {
  const { root, focus } = rootOf(pokemon);
  const levels = [[root]];
  let frontier = [root];
  while (frontier.length) {
    const next = frontier.flatMap((p) => childrenOf.get(p.id) || []);
    if (!next.length) break;
    levels.push(next);
    frontier = next;
  }
  if (levels.length === 1 && levels[0].length === 1) return null;
  return { levels, focusId: focus.id };
}

// The chip has room for a phrase, not a sentence: "Use a Water Stone" →
// "Water Stone", "Level 16 during the day" → "Lv 16, day", "Trade holding
// a Metal Coat" → "Trade + Metal Coat", "Use a Leaf Stone, or level up near
// a Moss Rock" → "Leaf Stone / Moss Rock". The full text stays in the title.
// A tile is square and about 90px wide (App.css), so a method needs to
// stay under ~30 characters — the few dex lines that run longer get their
// own phrasing here.
const TERSE = {
  "Have 49+ HP lost and walk under stone sculpture in Dusty Bowl": "Dusty Bowl arch, 49+ HP lost",
  "Evolve Nincada with an empty party slot and a Poké Ball": "Empty party slot + Poké Ball",
  "Defeat 3 Bisharp leading Pawniard and level-up": "Beat 3 leader Bisharp, Lv-up",
  "Level 20 with an Atk stat equal to its Def stat": "Level 20 with Attack = Defense",
  "Level 20 with an Atk stat > its Def stat": "Level 20 with Attack > Defense",
  "Level 20 with an Atk stat < its Def stat": "Level 20 with Attack < Defense",
  "Level 30 with the console turned upside-down": "Lv 30, console upside-down",
  "Use Agile style Psyshield Bash 20 times": "Agile Psyshield Bash ×20",
  "Use Strong style Barb Barrage 20 times": "Strong Barb Barrage ×20",
  "Trade holding a Prism Scale, or level up with max Beauty": "Prism Scale trade / max Beauty",
  "Receive 294+ recoil without fainting": "294+ recoil, no fainting",
  "Level 32 with a Dark-type in the party": "Lv 32, Dark-type in party",
  "Use Rage Fist 20 times and level-up": "Rage Fist ×20, Lv-up",
  "Land 3 critical hits in 1 battle": "3 crits in one battle",
  "Defeat the Single Strike Tower": "Beat Single Strike Tower",
  "Defeat the Rapid Strike Tower": "Beat Rapid Strike Tower",
  "Level 25 from a special Rockruff during the evening": "Lv 25, Dusk",
};

// Title Case, leaving the little words alone: "Lv 20, female, cave
// battle" → "Lv 20, Female, Cave Battle", "Trade + Metal Coat", "in Galar".
const SMALL = new Set(["a", "an", "the", "and", "or", "in", "at", "on", "of", "with", "its", "per", "vs"]);
export function titleCase(text, mid = false) {
  return text.replace(/[A-Za-zÀ-ÿ'’]+/g, (w, i) => ((mid || i > 0) && SMALL.has(w) ? w : w[0].toUpperCase() + w.slice(1)));
}

export function shortHow(detail) {
  return titleCase(shortHowRaw(detail));
}

function shortHowRaw(detail) {
  if (TERSE[detail]) return TERSE[detail];
  return detail
    .replace(/^Use an? /, "")
    .replace(/, or level up in a special magnetic field$/, " / magnetic field")
    .replace(/, or use an? /, " / ")
    .replace(/, or level up near an? /, " / ")
    .replace(/, or level up at /, " / ")
    .replace(/, or level up /, " / ")
    .replace(/^Level up holding an? /, "Holding ")
    .replace(/^Level up knowing /, "Knowing ")
    .replace(/^Level up with /, "With ")
    .replace(/^Level up in a special magnetic field/, "Magnetic field")
    .replace(/ in a special magnetic field/, " / magnetic field")
    .replace(/^Level up /, "Lv-up ")
    .replace(/^Level (\d+)/, "Lv $1")
    .replace(/^Trade holding an? /, "Trade + ")
    .replace(/^Trade, or use a Linking Cord$/, "Trade / Linking Cord")
    .replace(/^High friendship while knowing a Fairy-type move$/, "Friendship + Fairy move")
    .replace(/^High friendship/, "Friendship")
    .replace(/^Walk (\d+) steps in Let's Go$/, "$1 steps (Let's Go)")
    .replace(/ during the day$/, ", day")
    .replace(/ at night$/, ", night")
    .replace(/ during rain$/, ", rain")
    .replace(/Mount Lanakila/, "Mt. Lanakila");
}

// Where an evolution has to happen, when the dex's line for it doesn't say:
// a regional form that evolves from a non-regional (or differently
// regional) Pokémon — Koffing → Galarian Weezing, Pikachu → Alolan Raichu,
// Quilava → Hisuian Typhlosion — does so by evolving in that region;
// elsewhere it becomes the usual form. Null when nothing needs saying.
const REGION_FORMS = new Set(["Alola", "Galar", "Hisui", "Paldea"]);
export function evoWhere(pokemon) {
  if (!REGION_FORMS.has(pokemon.form)) return null;
  const prevo = POKEMON_BY_ID.get(pokemon.prevo);
  if (!prevo || prevo.form === pokemon.form) return null;
  return `in ${pokemon.form}`;
}

// What the dex line leaves out — the sides of a branch that share one
// line, and the gender an evolution needs (keyed by the record's slug).
// Burmy's cloak, and so its Wormadam, follows where it last battled:
// grass and outdoors, caves and sand, or inside a building.
const NOTES = {
  solgaleo: "in Sun / Scarlet",
  lunala: "in Moon / Violet",
  silcoon: "random",
  cascoon: "random",
  wormadam: "female, outdoor battle",
  wormadamsandy: "female, cave battle",
  wormadamtrash: "female, indoor battle",
  mothim: "male",
  gallade: "male",
  froslass: "female",
  salazzle: "female",
  vespiquen: "female",
  meowstic: "male",
  meowsticf: "female",
  oinkologne: "male",
  oinkolognef: "female",
  basculegion: "male",
  basculegionf: "female",
  toxtricity: "Amped natures",
  toxtricitylowkey: "Low Key natures",
  dudunsparce: "usually",
  dudunsparcethreesegment: "1 in 100",
};

// What to add after the method: the region for a regional form, or the
// note above. Null when nothing needs saying.
export function evoNote(pokemon) {
  const note = evoWhere(pokemon) || NOTES[pokemon.name] || null;
  return note && titleCase(note, true); // it follows the method mid-line
}
