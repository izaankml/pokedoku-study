// Every category a PokeDoku row or column can ask for, as predicates over
// dataset records. `group` drives pair-validity rules, weighting, and the
// stats table. `priorWeight` biases question selection before any answer
// history exists (3 = the user's known weak spots).

import { ABILITIES, MOVES } from "./traits.js";

const TYPE_NAMES = [
  "normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison",
  "ground", "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark",
  "steel", "fairy",
];

const REGIONS = [
  ["kanto", "Kanto", 1],
  ["johto", "Johto", 1],
  ["hoenn", "Hoenn", 1],
  ["sinnoh", "Sinnoh", 1],
  ["unova", "Unova", 3],
  ["kalos", "Kalos", 3],
  ["alola", "Alola", 3],
  ["galar", "Galar", 3],
  ["hisui", "Hisui", 3],
  ["paldea", "Paldea", 3],
];

const cap = (s) => s[0].toUpperCase() + s.slice(1);

export const CATEGORIES = [
  ...TYPE_NAMES.map((t) => ({
    id: `type-${t}`,
    label: `${cap(t)} Type`,
    short: cap(t),
    group: "type",
    priorWeight: 1,
    predicate: (p) => p.types.includes(t),
  })),
  {
    id: "mono",
    label: "Mono-Type",
    short: "Mono-Type",
    group: "typeCount",
    priorWeight: 1,
    predicate: (p) => p.types.length === 1,
  },
  {
    id: "dual",
    label: "Dual-Type",
    short: "Dual-Type",
    group: "typeCount",
    priorWeight: 1,
    predicate: (p) => p.types.length === 2,
  },
  ...REGIONS.map(([id, label, priorWeight]) => ({
    id: `region-${id}`,
    label: `From ${label}`,
    short: label,
    group: "region",
    priorWeight,
    // `regions` lists every region a record counts for: a species' origin,
    // or for a form that debuted elsewhere, both (White-Striped Basculin is
    // Unova and Hisui) — see scripts/build-dataset.mjs
    predicate: (p) => p.regions.includes(id),
  })),
  // A Pokémon counts for every method that evolves it in some core game
  // (Alakazam: trade and item, via the Linking Cord). Stone is the subset
  // of item where an evolution stone is used, not held.
  ...[
    ["level", "Evolved by Level-Up", "Level Evo", 2],
    ["item", "Evolved by Item", "Item Evo", 2],
    ["stone", "Evolved by Stone", "Stone Evo", 2],
    ["trade", "Evolved by Trade", "Trade Evo", 2],
    ["friendship", "Evolved by Friendship", "Friendship Evo", 2],
  ].map(([m, label, short, priorWeight]) => ({
    id: `evo-${m}`,
    label,
    short,
    group: "evo",
    priorWeight,
    predicate: (p) => p.evoMethods.includes(m),
  })),
  ...[
    ["first", "First Stage", "First Stage"],
    ["middle", "Middle Stage", "Middle Stage"],
    ["final", "Final Stage", "Final Stage"],
    ["single", "No Evolution Line", "No Evo Line"],
  ].map(([st, label, short]) => ({
    id: `stage-${st}`,
    label,
    short,
    group: "stage",
    priorWeight: 1,
    predicate: (p) => p.stage === st,
  })),
  {
    id: "stage-notFully",
    label: "Not Fully Evolved",
    short: "Not Fully Evolved",
    group: "stage",
    priorWeight: 1,
    predicate: (p) => p.stage === "first" || p.stage === "middle",
  },
  {
    id: "branched",
    label: "Branched Evolution",
    short: "Branched",
    group: "evoLine",
    priorWeight: 2,
    predicate: (p) => p.branched,
  },
  // Mega and Gigantamax are the Mega/Gigantamax form records themselves
  // (Mega Charizard X, Gigantamax Charizard), not the base species.
  ...[
    ["legendary", "Legendary", 1],
    ["mythical", "Mythical", 1],
    ["ultraBeast", "Ultra Beast", 2],
    ["paradox", "Paradox", 2],
    ["fossil", "Fossil", 1],
    ["starter", "First Partner (Starter Line)", 1],
    ["baby", "Baby", 1],
    ["mega", "Mega Evolution", 2],
    ["gmax", "Gigantamax", 2],
  ].map(([f, label, priorWeight]) => ({
    id: `flag-${f}`,
    label,
    short: label.replace(" (Starter Line)", ""),
    group: "special",
    priorWeight,
    predicate: (p) => p.flags.includes(f),
  })),
  ...MOVES.map((m) => ({
    id: `move-${m.id}`,
    label: `Learns ${m.name}`,
    short: m.name,
    group: "move",
    priorWeight: 2,
    predicate: (p) => p.moves.includes(m.id),
  })),
  ...ABILITIES.map((a) => ({
    id: `ability-${a.id}`,
    label: `Has ${a.name}`,
    short: a.name,
    group: "ability",
    priorWeight: 2,
    predicate: (p) => p.abilities.includes(a.id),
  })),
];

export const CATEGORY_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export const CATEGORY_GROUPS = [
  ["region", "Regions"],
  ["type", "Types"],
  ["typeCount", "Type Count"],
  ["evo", "Evolution Method"],
  ["stage", "Evolution Stage"],
  ["evoLine", "Evolution Line"],
  ["special", "Group"],
  ["move", "Moves"],
  ["ability", "Abilities"],
];

// Groups where one Pokémon can never satisfy two categories, so such pairs
// are structurally empty. Everything else (types → dual types, evolution
// methods → Alakazam, regions → dual-region forms, ...) is decided by the
// actual intersection.
export const EXCLUSIVE_GROUPS = new Set(["typeCount", "stage"]);

export function getCategory(id) {
  const cat = CATEGORY_BY_ID.get(id);
  if (!cat) throw new Error(`unknown category: ${id}`);
  return cat;
}
