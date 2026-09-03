// The per-pair pick table a random grid draws real pick rates from: for
// every category pair PokeDoku has run, its players' picks summed over
// every archived board that had it — public/archive/pairs.json, rebuilt
// by the harvest from the archive on every save (scripts/
// harvest-pick-stats.ts). Only boards archived while current carry their
// spec, so only they contribute. A cell under the pick floor, or on an
// axis the app can't map, is left out while the board's other cells still
// count. Pokémon keep PokeDoku's ids, as in the archive (the app folds
// them with appIdFor when it reads the table).
import type { PairStatsData, PickStatsPuzzle } from "../data/types.ts";
import { pairKey } from "./matching.ts";
import { specCellPair } from "./pokedokuSpec.ts";

interface PairTally {
  boards: number;
  total: number;
  counts: Map<number, number>;
}

export function buildPairStats(archives: PickStatsPuzzle[], minCellPicks: number): PairStatsData {
  const tallies = new Map<string, PairTally>();
  for (const puzzle of archives) {
    if (!puzzle.spec) continue;
    for (const [index, cell] of puzzle.cells.entries()) {
      if (cell.total < minCellPicks) continue;
      const pair = specCellPair(puzzle.spec, index);
      if (!pair) continue;
      const key = pairKey(...pair);
      const tally = tallies.get(key) ?? { boards: 0, total: 0, counts: new Map<number, number>() };
      tally.boards += 1;
      tally.total += cell.total;
      for (const [pokemonId, count] of cell.picks) {
        tally.counts.set(pokemonId, (tally.counts.get(pokemonId) ?? 0) + count);
      }
      tallies.set(key, tally);
    }
  }
  // keys and picks in a fixed order, so a rebuild that changed nothing
  // writes the same bytes
  const table: PairStatsData = {};
  const sortedKeys = [...tallies.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const key of sortedKeys) {
    const tally = tallies.get(key);
    if (!tally) continue;
    const picks = [...tally.counts].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    table[key] = { boards: tally.boards, total: tally.total, picks };
  }
  return table;
}
