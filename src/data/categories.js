// Every category a PokeDoku row or column can ask for, as predicates over
// dataset records. `group` drives pair-validity rules, weighting, and the
// stats table. `priorWeight` biases question selection before any answer
// history exists (3 = the user's known weak spots).

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
    label: `${cap(t)} type`,
    short: cap(t),
    group: "type",
    priorWeight: 1,
    predicate: (p) => p.types.includes(t),
  })),
  {
    id: "mono",
    label: "Mono-type",
    short: "Mono-type",
    group: "typeCount",
    priorWeight: 1,
    predicate: (p) => p.types.length === 1,
  },
  {
    id: "dual",
    label: "Dual-type",
    short: "Dual-type",
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
    predicate: (p) => p.region === id,
  })),
  ...[
    ["level", "Evolved by level-up", "Level evo"],
    ["item", "Evolved by item", "Item evo"],
    ["trade", "Evolved by trade", "Trade evo"],
    ["friendship", "Evolved by friendship", "Friendship evo"],
  ].map(([m, label, short]) => ({
    id: `evo-${m}`,
    label,
    short,
    group: "evo",
    priorWeight: 2,
    predicate: (p) => p.evoMethod === m,
  })),
  ...[
    ["first", "First stage"],
    ["middle", "Middle stage"],
    ["final", "Final stage"],
    ["single", "Single stage (no evolutions)"],
  ].map(([st, label]) => ({
    id: `stage-${st}`,
    label,
    short: label.replace(" (no evolutions)", ""),
    group: "stage",
    priorWeight: 1,
    predicate: (p) => p.stage === st,
  })),
  ...[
    ["legendary", "Legendary", 1],
    ["mythical", "Mythical", 1],
    ["ultraBeast", "Ultra Beast", 2],
    ["paradox", "Paradox", 2],
    ["fossil", "Fossil", 1],
    ["starter", "First partner (starter line)", 1],
    ["baby", "Baby", 1],
    ["mega", "Has a Mega Evolution", 2],
    ["gmax", "Has a Gigantamax form", 2],
  ].map(([f, label, priorWeight]) => ({
    id: `flag-${f}`,
    label,
    short: label.replace("Has a ", "").replace(" (starter line)", ""),
    group: "special",
    priorWeight,
    predicate: (p) => p.flags.includes(f),
  })),
];

export const CATEGORY_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export const CATEGORY_GROUPS = [
  ["type", "Types"],
  ["typeCount", "Type count"],
  ["region", "Regions"],
  ["evo", "Evolution method"],
  ["stage", "Evolution stage"],
  ["special", "Special"],
];

export function getCategory(id) {
  const cat = CATEGORY_BY_ID.get(id);
  if (!cat) throw new Error(`unknown category: ${id}`);
  return cat;
}
