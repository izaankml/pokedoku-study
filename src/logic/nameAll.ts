// The Drill's "Name all" round: every Pokémon (one per species) fitting a
// pair of categories or a single Group, small enough to name in one
// sitting. Which shapes of question get drawn is the user's choice.

import { CATEGORY_BY_ID, QUIZ_CATEGORIES } from "../data/categories.ts";
import type { Category, CategoryGroup } from "../data/categories.ts";
import type { Pokemon } from "../data/types.ts";
import { loadJson, saveJson } from "./hashState.ts";
import { intersectAll, pairIsValid } from "./matching.ts";
import { categoryWeight, pickWeighted } from "./picker.ts";
import type { RandomSource } from "./picker.ts";
import type { MergedStats } from "./stats.ts";

// A question: one category, or a pair
export type NameAllTarget = [Category] | [Category, Category];

// The shapes a round can take, in the panel's order
export const NAME_ALL_KINDS = [
  ["type+type", "Type × Type"],
  ["type+region", "Type × Region"],
  ["type+special", "Type × Group"],
  ["region+special", "Region × Group"],
  ["special", "Group"],
] as const;
export type NameAllKind = (typeof NAME_ALL_KINDS)[number][0];
export const ALL_NAME_ALL_KINDS: NameAllKind[] = NAME_ALL_KINDS.map(([kind]) => kind);
export const isNameAllKind = (value: unknown): value is NameAllKind => ALL_NAME_ALL_KINDS.some((kind) => kind === value);

// A round names between these many species: a pair with one answer is a
// plain drill, and Legendary's eighty-odd would be a chore
export const NAME_ALL_MIN = 2;
export const NAME_ALL_MAX = 40;

// Everyone fitting the target, one record per species (the base form
// where it fits, else the first form that does), in dataset order
export function nameAllSpecies(target: NameAllTarget): Pokemon[] {
  const bySpecies = new Map<number, Pokemon>();
  for (const pokemon of intersectAll(target.map((category) => category.id))) {
    const kept = bySpecies.get(pokemon.species);
    if (!kept || (kept.form !== null && pokemon.form === null)) bySpecies.set(pokemon.species, pokemon);
  }
  return [...bySpecies.values()];
}

export const nameAllKey = (target: NameAllTarget): string => target.map((category) => category.id).join("|");

// The shape a target is, or null when it's none the round draws
const GROUP_ORDER: Partial<Record<CategoryGroup, number>> = { type: 0, region: 1, special: 2 };
export function nameAllKindOf(target: NameAllTarget): NameAllKind | null {
  const groups = target.map((category) => category.group);
  if (groups.some((group) => GROUP_ORDER[group] === undefined)) return null;
  const key = [...groups].sort((a, b) => (GROUP_ORDER[a] ?? 0) - (GROUP_ORDER[b] ?? 0)).join("+");
  return isNameAllKind(key) ? key : null;
}

// Every target of a shape within the size limits, built once per shape
const candidatesCache = new Map<NameAllKind, NameAllTarget[]>();
export function nameAllCandidates(kind: NameAllKind): NameAllTarget[] {
  let candidates = candidatesCache.get(kind);
  if (!candidates) {
    const [groupA, groupB] = kind.split("+") as [CategoryGroup, CategoryGroup | undefined];
    const inA = QUIZ_CATEGORIES.filter((category) => category.group === groupA);
    const targets: NameAllTarget[] =
      groupB === undefined
        ? inA.map((category): NameAllTarget => [category])
        : inA.flatMap((a) =>
            QUIZ_CATEGORIES.filter(
              (b) => b.group === groupB && (groupA !== groupB || a.id < b.id) && pairIsValid(a.id, b.id),
            ).map((b): NameAllTarget => [a, b]),
          );
    candidates = targets.filter((target) => {
      const count = nameAllSpecies(target).length;
      return count >= NAME_ALL_MIN && count <= NAME_ALL_MAX;
    });
    candidatesCache.set(kind, candidates);
  }
  return candidates;
}

export interface PickNameAllOptions {
  // the round just played (nameAllKey), not to ask again right away
  avoid?: string | null;
  random?: RandomSource;
}

// A round from the chosen shapes (every shape when none is chosen),
// weighted toward the categories the user gets wrong
export function pickNameAllTarget(
  merged: MergedStats,
  kinds: NameAllKind[],
  { avoid = null, random = Math.random }: PickNameAllOptions = {},
): NameAllTarget {
  const pool = (kinds.length ? kinds : ALL_NAME_ALL_KINDS).flatMap(nameAllCandidates);
  const fresh = pool.filter((target) => nameAllKey(target) !== avoid);
  const from = fresh.length ? fresh : pool;
  if (!from.length) throw new Error("no Name-all rounds to draw from");
  return pickWeighted(
    from,
    (target) => target.reduce((weight, category) => weight * categoryWeight(category, merged), 1),
    random,
  );
}

// The target a URL names (#drill/all/type-fire/type-flying), if it's a
// shape the round draws
export function nameAllTargetFrom(ids: string[]): NameAllTarget | null {
  const categories = ids.map((id) => CATEGORY_BY_ID.get(id));
  const [a, b] = categories;
  if (!a || a.browseOnly) return null;
  let target: NameAllTarget;
  if (categories.length === 1) target = [a];
  else if (categories.length === 2 && b && !b.browseOnly && pairIsValid(a.id, b.id)) target = [a, b];
  else return null;
  return nameAllKindOf(target) ? target : null;
}

// ---- the chosen shapes, remembered ----

const KINDS_KEY = "pokedoku-study:drill-name-all-kinds:v1";

export function loadNameAllKinds(): NameAllKind[] {
  const saved = loadJson(KINDS_KEY);
  const kinds = Array.isArray(saved) ? saved.filter(isNameAllKind) : [];
  return kinds.length ? kinds : ALL_NAME_ALL_KINDS;
}

export function saveNameAllKinds(kinds: NameAllKind[]): void {
  saveJson(KINDS_KEY, kinds);
}
