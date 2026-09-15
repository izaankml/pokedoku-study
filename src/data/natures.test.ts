import { describe, expect, it } from "vitest";
import { NATURES, NATURE_BY_ID, STAT_NAMES } from "./natures.ts";

describe("natures", () => {
  it("lists the 25 natures once each, keyed by their lower-case names", () => {
    expect(NATURES).toHaveLength(25);
    expect(new Set(NATURES.map((nature) => nature.id)).size).toBe(25);
    expect(NATURE_BY_ID.get("adamant")?.name).toBe("Adamant");
  });

  it("gives every raised and lowered pair to exactly one nature, and nothing to the five neutral ones", () => {
    const changing = NATURES.filter((nature) => nature.raised !== null);
    expect(changing).toHaveLength(20);
    for (const nature of changing) expect(nature.raised).not.toBe(nature.lowered);
    const pairs = new Set(changing.map((nature) => `${nature.raised}/${nature.lowered}`));
    expect(pairs.size).toBe(STAT_NAMES.length * (STAT_NAMES.length - 1));
    const neutral = NATURES.filter((nature) => nature.raised === null);
    expect(neutral.map((nature) => nature.name).sort()).toEqual(["Bashful", "Docile", "Hardy", "Quirky", "Serious"]);
    for (const nature of neutral) expect(nature.lowered).toBe(null);
    expect(NATURE_BY_ID.get("adamant")).toMatchObject({ raised: "attack", lowered: "spAttack" });
    expect(NATURE_BY_ID.get("timid")).toMatchObject({ raised: "speed", lowered: "attack" });
  });
});
