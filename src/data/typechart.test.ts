import { describe, expect, it } from "vitest";
import { TYPE_CHART, defensiveMultiplier, weaknessesOf } from "./typechart.ts";
import { TYPE_NAMES } from "./types.ts";

describe("type chart", () => {
  it("covers all 18 types with only 0 / ½ / 2 entries", () => {
    expect(Object.keys(TYPE_CHART).sort()).toEqual([...TYPE_NAMES].sort());
    for (const row of Object.values(TYPE_CHART)) {
      for (const multiplier of Object.values(row)) {
        expect([0, 0.5, 2]).toContain(multiplier);
      }
    }
  });

  it("has the canonical entry counts", () => {
    // the Gen 6+ chart: 51 super-effective, 61 resisted, 8 immune
    const all = Object.values(TYPE_CHART).flatMap((row) => Object.values(row));
    expect(all.filter((multiplier) => multiplier === 2).length).toBe(51);
    expect(all.filter((multiplier) => multiplier === 0.5).length).toBe(61);
    expect(all.filter((multiplier) => multiplier === 0).length).toBe(8);
  });

  it("pins known single-type matchups", () => {
    expect(defensiveMultiplier("fire", ["grass"])).toBe(2);
    expect(defensiveMultiplier("fire", ["water"])).toBe(0.5);
    expect(defensiveMultiplier("electric", ["ground"])).toBe(0);
    expect(defensiveMultiplier("normal", ["ghost"])).toBe(0);
    expect(defensiveMultiplier("dragon", ["fairy"])).toBe(0);
    expect(defensiveMultiplier("poison", ["steel"])).toBe(0);
  });

  it("multiplies over dual types", () => {
    // Gyarados (Water/Flying): ×4 from Electric, ×1 from Grass (2 × ½)
    expect(defensiveMultiplier("electric", ["water", "flying"])).toBe(4);
    expect(defensiveMultiplier("grass", ["water", "flying"])).toBe(1);
    // Garchomp (Dragon/Ground): ×4 from Ice
    expect(defensiveMultiplier("ice", ["dragon", "ground"])).toBe(4);
  });

  it("lists weaknesses for known Pokémon typings", () => {
    // Charizard (Fire/Flying)
    expect(weaknessesOf(["fire", "flying"])).toEqual(["water", "electric", "rock"]);
    // Gyarados (Water/Flying)
    expect(weaknessesOf(["water", "flying"])).toEqual(["electric", "rock"]);
    // Snorlax (Normal): only Fighting
    expect(weaknessesOf(["normal"])).toEqual(["fighting"]);
    // pure Electric is Ground only
    expect(weaknessesOf(["electric"])).toEqual(["ground"]);
    // Shedinja's typing (Bug/Ghost)
    expect(weaknessesOf(["bug", "ghost"])).toEqual(["fire", "flying", "rock", "ghost", "dark"]);
  });
});
