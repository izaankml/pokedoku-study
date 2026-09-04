import { describe, expect, it } from "vitest";
import type { Pokemon } from "../data/types.ts";
import {
  buildWeights,
  estimatePickPercent,
  estimatePickPercents,
  formatPickEstimate,
  formatPickPercent,
  PICK_STATS_META,
} from "./uniqueness.ts";

const mon = (id: number): Pokemon => ({ id }) as Pokemon;

describe("buildWeights", () => {
  it("averages each Pokémon's pick share over the cells it appeared in", () => {
    const weights = buildWeights({ "25": [2, 0.5], "133": [1, 0.05] });
    expect(weights.get(25)).toBeCloseTo(0.25);
    expect(weights.get(133)).toBeCloseTo(0.05);
  });

  it("folds PokeDoku's Zygarde form id into the species the app uses", () => {
    const weights = buildWeights({ "718": [1, 0.1], "10119": [1, 0.3] });
    expect(weights.get(718)).toBeCloseTo(0.2);
    expect(weights.has(10119)).toBe(false);
  });
});

describe("estimatePickPercent", () => {
  it("normalizes weights over the cell's answer pool", () => {
    // real prior: percentages over any pool must sum to 100
    const pool = [mon(25), mon(6), mon(150), mon(133)];
    const total = pool.reduce((sum, pick) => sum + (estimatePickPercent(pick, pool) ?? 0), 0);
    expect(total).toBeCloseTo(100);
  });

  it("gives an unseen Pokémon a smaller share than any observed one", () => {
    const unseen = mon(999_999);
    const pool = [mon(25), unseen];
    const unseenShare = estimatePickPercent(unseen, pool);
    const seenShare = estimatePickPercent(mon(25), pool);
    expect(unseenShare).not.toBeNull();
    expect(seenShare).not.toBeNull();
    expect(unseenShare!).toBeLessThan(seenShare!);
    expect(unseenShare!).toBeGreaterThan(0);
  });
});

describe("estimatePickPercents", () => {
  it("estimates every pool member at once, agreeing with the one-at-a-time estimate", () => {
    const pool = [mon(25), mon(6), mon(150), mon(999_999)];
    const estimates = estimatePickPercents(pool);
    expect(estimates.size).toBe(pool.length);
    let total = 0;
    for (const pick of pool) {
      const estimate = estimates.get(pick.id);
      expect(estimate).toBeCloseTo(estimatePickPercent(pick, pool) ?? -1);
      total += estimate ?? 0;
    }
    expect(total).toBeCloseTo(100);
  });
});

describe("harvested data", () => {
  it("ships a populated prior", () => {
    expect(PICK_STATS_META.puzzlesCounted).toBeGreaterThan(0);
    expect(PICK_STATS_META.cellsCounted).toBeGreaterThan(0);
  });
});

describe("formatPickPercent", () => {
  it("shows up to two decimals, dropping trailing zeros", () => {
    expect(formatPickPercent(23)).toBe("23%");
    expect(formatPickPercent(23.4)).toBe("23.4%");
    expect(formatPickPercent(23.456)).toBe("23.46%");
    expect(formatPickPercent(0.4)).toBe("0.4%");
  });

  it("floors anything under a hundredth to <0.01%", () => {
    expect(formatPickPercent(0.004)).toBe("<0.01%");
  });
});

describe("formatPickEstimate", () => {
  it("marks an estimate with a tilde, except a floored one", () => {
    expect(formatPickEstimate(23.4)).toBe("~23.4%");
    expect(formatPickEstimate(0.004)).toBe("<0.01%");
  });
});
