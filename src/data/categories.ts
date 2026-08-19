// Every category a PokeDoku row or column can ask for, as predicates over
// dataset records. `group` drives pair-validity rules, weighting, and the
// stats table. `priorWeight` biases question selection before any answer
// history exists (3 = the user's known weak spots). `miss` is the clause
// shown when a guess fails the category ("isn't Fire-type").

import { ABILITIES, MOVES } from "./traits.ts";
import { TYPE_NAMES } from "./types.ts";
import type { EvoMethod, Flag, Pokemon, Region, Stage } from "./types.ts";

export type CategoryGroup =
  | "type"
  | "typeCount"
  | "region"
  | "evo"
  | "stage"
  | "evoLine"
  | "special"
  | "move"
  | "ability";

export interface Category {
  id: string;
  // "Fire Type", "From Galar", "Learns Earthquake"
  label: string;
  // the label for a tight spot: "Fire", "Galar", "Earthquake"
  short: string;
  group: CategoryGroup;
  priorWeight: number;
  predicate: (pokemon: Pokemon) => boolean;
  // the clause for a Pokémon that fails this category alone
  miss: string;
}

const REGIONS: ReadonlyArray<readonly [Region, string, number]> = [
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

const EVO_CATEGORIES: ReadonlyArray<readonly [EvoMethod, string, string, number, string]> = [
  ["level", "Evolved by Level-Up", "Level Evolution", 2, "didn't evolve by levelling up"],
  ["item", "Evolved by Item", "Item Evolution", 2, "didn't evolve with an item"],
  ["stone", "Evolved by Stone", "Stone Evolution", 2, "didn't evolve with a stone"],
  ["trade", "Evolved by Trade", "Trade Evolution", 2, "didn't evolve by trade"],
  ["friendship", "Evolved by Friendship", "Friendship Evolution", 2, "didn't evolve by friendship"],
];

const STAGE_CATEGORIES: ReadonlyArray<readonly [Stage, string, string, string]> = [
  ["first", "First Stage", "First Stage", "isn't a first-stage Pokémon"],
  ["middle", "Middle Stage", "Middle Stage", "isn't a middle-stage Pokémon"],
  ["final", "Final Stage", "Final Stage", "isn't a final-stage Pokémon"],
  ["single", "No Evolution Line", "No Evolution Line", "has an evolution line"],
];

const FLAG_CATEGORIES: ReadonlyArray<readonly [Flag, string, number, string]> = [
  ["legendary", "Legendary", 1, "isn't Legendary"],
  ["mythical", "Mythical", 1, "isn't Mythical"],
  ["ultraBeast", "Ultra Beast", 2, "isn't an Ultra Beast"],
  ["paradox", "Paradox", 2, "isn't a Paradox Pokémon"],
  ["fossil", "Fossil", 1, "isn't a Fossil Pokémon"],
  ["starter", "First Partner (Starter Line)", 1, "isn't in a First Partner line"],
  ["baby", "Baby", 1, "isn't a Baby Pokémon"],
  ["mega", "Mega Evolution", 2, "isn't a Mega Evolution"],
  ["gmax", "Gigantamax", 2, "isn't a Gigantamax form"],
];

const cap = (text: string): string => text[0].toUpperCase() + text.slice(1);

export const CATEGORIES: Category[] = [
  ...TYPE_NAMES.map(
    (type): Category => ({
      id: `type-${type}`,
      label: `${cap(type)} Type`,
      short: cap(type),
      group: "type",
      priorWeight: 1,
      predicate: (pokemon) => pokemon.types.includes(type),
      miss: `isn't ${cap(type)}-type`,
    }),
  ),
  {
    id: "mono",
    label: "Mono-Type",
    short: "Mono-Type",
    group: "typeCount",
    priorWeight: 1,
    predicate: (pokemon) => pokemon.types.length === 1,
    miss: "has two types",
  },
  {
    id: "dual",
    label: "Dual-Type",
    short: "Dual-Type",
    group: "typeCount",
    priorWeight: 1,
    predicate: (pokemon) => pokemon.types.length === 2,
    miss: "has only one type",
  },
  ...REGIONS.map(
    ([id, label, priorWeight]): Category => ({
      id: `region-${id}`,
      label: `From ${label}`,
      short: label,
      group: "region",
      priorWeight,
      // `regions` lists every region a record counts for: a species' origin,
      // or for a form that debuted elsewhere, both (White-Striped Basculin is
      // Unova and Hisui) — see scripts/build-dataset.ts
      predicate: (pokemon) => pokemon.regions.includes(id),
      miss: `isn't from ${label}`,
    }),
  ),
  // A Pokémon counts for every method that evolves it in some core game
  // (Alakazam: trade and item, via the Linking Cord). Stone is the subset
  // of item where an evolution stone is used, not held.
  ...EVO_CATEGORIES.map(
    ([method, label, short, priorWeight, miss]): Category => ({
      id: `evo-${method}`,
      label,
      short,
      group: "evo",
      priorWeight,
      predicate: (pokemon) => pokemon.evoMethods.includes(method),
      miss,
    }),
  ),
  ...STAGE_CATEGORIES.map(
    ([stage, label, short, miss]): Category => ({
      id: `stage-${stage}`,
      label,
      short,
      group: "stage",
      priorWeight: 1,
      predicate: (pokemon) => pokemon.stage === stage,
      miss,
    }),
  ),
  {
    id: "stage-notFully",
    label: "Not Fully Evolved",
    short: "Not Fully Evolved",
    group: "stage",
    priorWeight: 1,
    predicate: (pokemon) => pokemon.stage === "first" || pokemon.stage === "middle",
    miss: "is fully evolved",
  },
  {
    id: "branched",
    label: "Branched Evolution",
    short: "Branched",
    group: "evoLine",
    priorWeight: 2,
    predicate: (pokemon) => pokemon.branched,
    miss: "doesn't have a branched evolution",
  },
  // Mega and Gigantamax are the Mega/Gigantamax form records themselves
  // (Mega Charizard X, Gigantamax Charizard), not the base species.
  ...FLAG_CATEGORIES.map(
    ([flag, label, priorWeight, miss]): Category => ({
      id: `flag-${flag}`,
      label,
      short: label.replace(" (Starter Line)", ""),
      group: "special",
      priorWeight,
      predicate: (pokemon) => pokemon.flags.includes(flag),
      miss,
    }),
  ),
  ...MOVES.map(
    (move): Category => ({
      id: `move-${move.id}`,
      label: `Learns ${move.name}`,
      short: move.name,
      group: "move",
      priorWeight: 2,
      predicate: (pokemon) => pokemon.moves.includes(move.id),
      miss: `can't learn ${move.name}`,
    }),
  ),
  ...ABILITIES.map(
    (ability): Category => ({
      id: `ability-${ability.id}`,
      label: `Has ${ability.name}`,
      short: ability.name,
      group: "ability",
      priorWeight: 2,
      predicate: (pokemon) => pokemon.abilities.includes(ability.id),
      miss: `doesn't have ${ability.name}`,
    }),
  ),
];

export const CATEGORY_BY_ID = new Map<string, Category>(CATEGORIES.map((category) => [category.id, category]));

// Whether a category is decided by a Pokémon's evolution line — its stage,
// how it evolved, whether the line branches, whether it's a First Partner
// or Baby line. Mega and Gigantamax forms sit outside every line (no
// stage, no method), so they are never answers there and needn't be
// offered as guesses.
const EVOLUTION_LINE_GROUPS = new Set<CategoryGroup>(["evo", "stage", "evoLine"]);
const EVOLUTION_LINE_FLAGS = new Set(["flag-starter", "flag-baby"]);
export function considersEvolutionLine(catId: string): boolean {
  return EVOLUTION_LINE_GROUPS.has(getCategory(catId).group) || EVOLUTION_LINE_FLAGS.has(catId);
}

// Why a Pokémon fails a cell: "isn't Fire-type and isn't from Galar".
// Each category's `miss` is the clause for a Pokémon that fails it alone.
export function whyNot(pokemon: Pokemon, catIds: string[]): string {
  const clauses = catIds
    .map((id) => getCategory(id))
    .filter((category) => !category.predicate(pokemon))
    .map((category) => category.miss);
  return clauses.length ? clauses.join(" and ") : "";
}

export const CATEGORY_GROUPS: ReadonlyArray<readonly [CategoryGroup, string]> = [
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
export const EXCLUSIVE_GROUPS = new Set<CategoryGroup>(["typeCount", "stage"]);

export function getCategory(id: string): Category {
  const category = CATEGORY_BY_ID.get(id);
  if (!category) throw new Error(`unknown category: ${id}`);
  return category;
}
