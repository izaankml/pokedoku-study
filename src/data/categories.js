// Every category a PokeDoku row or column can ask for, as predicates over
// dataset records. `group` drives pair-validity rules, weighting, and the
// stats table. `priorWeight` biases question selection before any answer
// history exists (3 = the user's known weak spots). `miss` is the clause
// shown when a guess fails the category ("isn't Fire-type").

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
    miss: `isn't ${cap(t)}-type`,
  })),
  {
    id: "mono",
    label: "Mono-Type",
    short: "Mono-Type",
    group: "typeCount",
    priorWeight: 1,
    predicate: (p) => p.types.length === 1,
    miss: "has two types",
  },
  {
    id: "dual",
    label: "Dual-Type",
    short: "Dual-Type",
    group: "typeCount",
    priorWeight: 1,
    predicate: (p) => p.types.length === 2,
    miss: "has only one type",
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
    miss: `isn't from ${label}`,
  })),
  // A Pokémon counts for every method that evolves it in some core game
  // (Alakazam: trade and item, via the Linking Cord). Stone is the subset
  // of item where an evolution stone is used, not held.
  ...[
    ["level", "Evolved by Level-Up", "Level Evolution", 2, "didn't evolve by levelling up"],
    ["item", "Evolved by Item", "Item Evolution", 2, "didn't evolve with an item"],
    ["stone", "Evolved by Stone", "Stone Evolution", 2, "didn't evolve with a stone"],
    ["trade", "Evolved by Trade", "Trade Evolution", 2, "didn't evolve by trade"],
    ["friendship", "Evolved by Friendship", "Friendship Evolution", 2, "didn't evolve by friendship"],
  ].map(([m, label, short, priorWeight, miss]) => ({
    id: `evo-${m}`,
    label,
    short,
    group: "evo",
    priorWeight,
    predicate: (p) => p.evoMethods.includes(m),
    miss,
  })),
  ...[
    ["first", "First Stage", "First Stage", "isn't a first-stage Pokémon"],
    ["middle", "Middle Stage", "Middle Stage", "isn't a middle-stage Pokémon"],
    ["final", "Final Stage", "Final Stage", "isn't a final-stage Pokémon"],
    ["single", "No Evolution Line", "No Evolution Line", "has an evolution line"],
  ].map(([st, label, short, miss]) => ({
    id: `stage-${st}`,
    label,
    short,
    group: "stage",
    priorWeight: 1,
    predicate: (p) => p.stage === st,
    miss,
  })),
  {
    id: "stage-notFully",
    label: "Not Fully Evolved",
    short: "Not Fully Evolved",
    group: "stage",
    priorWeight: 1,
    predicate: (p) => p.stage === "first" || p.stage === "middle",
    miss: "is fully evolved",
  },
  {
    id: "branched",
    label: "Branched Evolution",
    short: "Branched",
    group: "evoLine",
    priorWeight: 2,
    predicate: (p) => p.branched,
    miss: "doesn't have a branched evolution",
  },
  // Mega and Gigantamax are the Mega/Gigantamax form records themselves
  // (Mega Charizard X, Gigantamax Charizard), not the base species.
  ...[
    ["legendary", "Legendary", 1, "isn't Legendary"],
    ["mythical", "Mythical", 1, "isn't Mythical"],
    ["ultraBeast", "Ultra Beast", 2, "isn't an Ultra Beast"],
    ["paradox", "Paradox", 2, "isn't a Paradox Pokémon"],
    ["fossil", "Fossil", 1, "isn't a Fossil Pokémon"],
    ["starter", "First Partner (Starter Line)", 1, "isn't in a First Partner line"],
    ["baby", "Baby", 1, "isn't a Baby Pokémon"],
    ["mega", "Mega Evolution", 2, "isn't a Mega Evolution"],
    ["gmax", "Gigantamax", 2, "isn't a Gigantamax form"],
  ].map(([f, label, priorWeight, miss]) => ({
    id: `flag-${f}`,
    label,
    short: label.replace(" (Starter Line)", ""),
    group: "special",
    priorWeight,
    predicate: (p) => p.flags.includes(f),
    miss,
  })),
  ...MOVES.map((m) => ({
    id: `move-${m.id}`,
    label: `Learns ${m.name}`,
    short: m.name,
    group: "move",
    priorWeight: 2,
    predicate: (p) => p.moves.includes(m.id),
    miss: `can't learn ${m.name}`,
  })),
  ...ABILITIES.map((a) => ({
    id: `ability-${a.id}`,
    label: `Has ${a.name}`,
    short: a.name,
    group: "ability",
    priorWeight: 2,
    predicate: (p) => p.abilities.includes(a.id),
    miss: `doesn't have ${a.name}`,
  })),
];

export const CATEGORY_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

// Why a Pokémon fails a cell: "isn't Fire-type and isn't from Galar".
// Each category's `miss` is the clause for a Pokémon that fails it alone.
// Whether a category is decided by a Pokémon's evolution line — its stage,
// how it evolved, whether the line branches, whether it's a First Partner
// or Baby line. Mega and Gigantamax forms sit outside every line (no
// stage, no method), so they are never answers there and needn't be
// offered as guesses.
const EVOLUTION_LINE_GROUPS = new Set(["evo", "stage", "evoLine"]);
const EVOLUTION_LINE_FLAGS = new Set(["flag-starter", "flag-baby"]);
export function considersEvolutionLine(catId) {
  return EVOLUTION_LINE_GROUPS.has(getCategory(catId).group) || EVOLUTION_LINE_FLAGS.has(catId);
}

export function whyNot(pokemon, catIds) {
  const clauses = catIds
    .map((id) => getCategory(id))
    .filter((c) => !c.predicate(pokemon))
    .map((c) => c.miss);
  return clauses.length ? clauses.join(" and ") : "";
}

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
