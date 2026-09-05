// Evolution lines, drawn from each record's `prevo` and `otherPrevos`. A
// line is a tree walked from its root; a Pokémon that doesn't evolve is a
// tree of one. Transformations (forms.ts) show their base's line.

import { ALL_POKEMON, POKEMON_BY_ID } from "../data/pokedex.ts";
import type { Pokemon } from "../data/types.ts";
import { baseOf, sharersOf } from "./forms.ts";

const byId = (id: number | null | undefined): Pokemon | undefined => (id === null || id === undefined ? undefined : POKEMON_BY_ID.get(id));

const childrenOf = new Map<number, Pokemon[]>();
for (const pokemon of ALL_POKEMON) {
  for (const parentId of [pokemon.prevo, ...(pokemon.otherPrevos ?? [])]) {
    if (parentId === null || parentId === undefined) continue;
    const siblings = childrenOf.get(parentId);
    if (siblings) siblings.push(pokemon);
    else childrenOf.set(parentId, [pokemon]);
  }
}
// dex order: by species number, forms after their base (a form's own id
// is beyond the dex, so Wormadam Sandy would otherwise trail Mothim)
for (const kids of childrenOf.values()) kids.sort((a, b) => a.species - b.species || a.id - b.id);

// The start of a Pokémon's line, climbing `prevo`
function climb(pokemon: Pokemon): Pokemon {
  let root = pokemon;
  const seen = new Set([root.id]);
  for (;;) {
    const prevo = byId(root.prevo);
    if (!prevo || seen.has(prevo.id)) break;
    root = prevo;
    seen.add(root.id);
  }
  return root;
}

// The root of the line a Pokémon belongs to, and the records to highlight:
// the Pokémon itself, or what it's a transformation of along with whoever
// shares that transformation (Mega Meowstic is both Meowstics').
function rootOf(pokemon: Pokemon): { root: Pokemon; focusIds: Set<number> } {
  let focus = baseOf(pokemon);
  // a transformation, or a cosmetic clone that has a stage but no line of
  // its own (Cowboy Hat Caterpie), shows its species' line
  const hasOwnLine = (entry: Pokemon): boolean => entry.prevo !== null || childrenOf.has(entry.id);
  if (focus.species !== focus.id && (focus.stage === null || (focus.stage !== "single" && !hasOwnLine(focus)))) {
    focus = POKEMON_BY_ID.get(focus.species) || focus;
  }
  let root = climb(focus);
  // a root that is only ever a second pre-evolution (Roaming Form
  // Gimmighoul) belongs to the primary pre-evolution's line
  const kids = childrenOf.get(root.id) || [];
  if (kids.length && kids.every((child) => child.prevo !== root.id)) root = climb(kids[0]);
  return { root, focusIds: new Set([focus.id, ...sharersOf(pokemon).map((sharer) => sharer.id)]) };
}

export interface EvolutionNode {
  pokemon: Pokemon;
  // its own evolutions, in dex order
  children: EvolutionNode[];
}

export interface EvolutionTree {
  root: EvolutionNode;
  // the other records that evolve into exactly what the root does (Roaming
  // Form Gimmighoul beside Gimmighoul); a record that shares only some
  // evolutions keeps its own tree instead
  coRoots: Pokemon[];
  // the records to highlight
  focusIds: Set<number>;
}

// The line as a tree, so each Pokémon is joined to its own evolutions:
// Sliggoo → Goodra and Hisuian Sliggoo → Hisuian Goodra are two chains
// under Goomy, not one branch of four. A Pokémon that doesn't evolve is a
// tree of just itself.
export function evolutionTree(pokemon: Pokemon): EvolutionTree {
  const { root, focusIds } = rootOf(pokemon);
  const node = (current: Pokemon): EvolutionNode => ({
    pokemon: current,
    children: (childrenOf.get(current.id) || []).map(node),
  });
  const rootKids = childrenOf.get(root.id) || [];
  const sameKids = (other: Pokemon): boolean => {
    const kids = childrenOf.get(other.id) || [];
    return kids.length === rootKids.length && kids.every((kid) => rootKids.includes(kid));
  };
  const coRootIds = new Set(rootKids.flatMap((child) => (child.otherPrevos ?? []).filter((id) => id !== root.id)));
  const coRoots = [...coRootIds]
    .map(byId)
    .filter((entry): entry is Pokemon => entry !== undefined)
    .filter(sameKids);
  return { root: node(root), coRoots, focusIds };
}

// The tile has room for a phrase, not a sentence ("Use a Water Stone"
// becomes "Water Stone"); the full text stays in the title. The few dex
// lines the rewrites below can't shorten enough get their own phrasing.
const TERSE: Record<string, string> = {
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

// Title Case, leaving the little words alone ("Lv 20, Female, Cave
// Battle", "in Galar").
const SMALL = new Set(["a", "an", "the", "and", "or", "in", "at", "on", "of", "with", "its", "per", "vs"]);
export function titleCase(text: string, mid = false): string {
  return text.replace(/[A-Za-zÀ-ÿ'’]+/g, (word: string, offset: number) =>
    (mid || offset > 0) && SMALL.has(word) ? word : word[0].toUpperCase() + word.slice(1),
  );
}

export function shortHow(detail: string): string {
  return titleCase(shortHowRaw(detail));
}

function shortHowRaw(detail: string): string {
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

// Where an evolution has to happen, when the dex's line doesn't say: a
// regional form that evolves from a differently regional Pokémon (Koffing
// to Galarian Weezing) does so in that region. Null when nothing needs
// saying.
const REGION_FORMS = new Set(["Alola", "Galar", "Hisui", "Paldea"]);
export function evoWhere(pokemon: Pokemon): string | null {
  if (pokemon.form === null || !REGION_FORMS.has(pokemon.form)) return null;
  const prevo = pokemon.prevo === null ? undefined : POKEMON_BY_ID.get(pokemon.prevo);
  if (!prevo || prevo.form === pokemon.form) return null;
  return `in ${pokemon.form}`;
}

// What the dex line leaves out: what tells apart the sides of a branch
// that share one line, and the gender an evolution needs (keyed by slug).
const NOTES: Record<string, string> = {
  solgaleo: "in Sun / Scarlet",
  lunala: "in Moon / Violet",
  silcoon: "random",
  cascoon: "random",
  wormadam: "female",
  wormadamsandy: "female",
  wormadamtrash: "female",
  mothim: "male",
  pyroar: "male",
  pyroarf: "female",
  unfezant: "male",
  unfezantf: "female",
  hippopotas: "male",
  hippopotasf: "female",
  hippowdon: "male",
  hippowdonf: "female",
  frillish: "male",
  frillishf: "female",
  jellicent: "male",
  jellicentf: "female",
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
  maushold: "usually",
  mausholdthree: "1 in 100",
};

// What to add after the method: the region for a regional form, or the
// note above. Null when nothing needs saying.
export function evoNote(pokemon: Pokemon): string | null {
  const note = evoWhere(pokemon) || NOTES[pokemon.name] || null;
  return note && titleCase(note, true); // it follows the method mid-line
}
