// Global pick-rate estimates, from the harvested PokeDoku daily stats
// (src/data/pick-stats.json, written by scripts/harvest-pick-stats.ts).
//
// The prior gives each Pokémon a weight: across every harvested daily
// cell it was picked in, the mean share of that cell's picks it took.
// Estimated pick% for a practice cell is the pick's weight normalized
// over the cell's whole answer pool — "of players facing this cell, how
// many would reach for this one". A cell's uniqueness is 100 minus that,
// mirroring PokeDoku's own 0–900 board score (each of 9 cells adds
// 100 − pick%; their untouched board reads 900).
import pickStatsJson from "../data/pick-stats.json" with { type: "json" };
import type { PickStatsData, Pokemon } from "../data/types.ts";

// JSON imports widen tuples to number[], hence the double assertion
const pickStats = pickStatsJson as unknown as PickStatsData;

// PokeDoku lists Zygarde 50% under its own form id; the app uses the species
const ID_ALIASES = new Map<number, number>([[10119, 718]]);

export function buildWeights(prior: PickStatsData["prior"]): Map<number, number> {
  const merged = new Map<number, [cells: number, shareSum: number]>();
  for (const [key, [cells, shareSum]] of Object.entries(prior)) {
    const id = ID_ALIASES.get(Number(key)) ?? Number(key);
    const entry = merged.get(id) ?? [0, 0];
    entry[0] += cells;
    entry[1] += shareSum;
    merged.set(id, entry);
  }
  return new Map([...merged].map(([id, [cells, shareSum]]) => [id, shareSum / cells]));
}

const WEIGHTS = buildWeights(pickStats.prior);
// never once picked across every harvested daily: rarer than anything observed
const UNSEEN_WEIGHT = WEIGHTS.size ? Math.min(...WEIGHTS.values()) / 2 : 0;

export const PICK_STATS_META = pickStats.meta;

const pickWeight = (id: number): number => WEIGHTS.get(id) ?? UNSEEN_WEIGHT;

// null when there is no harvested data to estimate from
export function estimatePickPercent(pokemon: Pokemon, pool: Pokemon[]): number | null {
  if (WEIGHTS.size === 0) return null;
  const poolWeight = pool.reduce((sum, candidate) => sum + pickWeight(candidate.id), 0);
  if (poolWeight <= 0) return null;
  return (100 * pickWeight(pokemon.id)) / poolWeight;
}

export function cellUniqueness(pokemon: Pokemon, pool: Pokemon[]): number | null {
  const estimate = estimatePickPercent(pokemon, pool);
  return estimate === null ? null : 100 - estimate;
}

// "<1%" below one, whole percent otherwise
export const formatPickPercent = (value: number): string =>
  value < 1 ? "<1%" : `${Math.round(value)}%`;
