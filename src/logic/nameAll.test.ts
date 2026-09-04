import { describe, expect, it } from "vitest";
import { getCategory } from "../data/categories.ts";
import {
  NAME_ALL_MAX,
  NAME_ALL_MIN,
  nameAllCandidates,
  nameAllKey,
  nameAllKindOf,
  nameAllSpecies,
  nameAllTargetFrom,
  pickNameAllTarget,
} from "./nameAll.ts";
import type { NameAllTarget } from "./nameAll.ts";
import { mergeBlocks } from "./stats.ts";

const merged = mergeBlocks([]);

describe("nameAllSpecies", () => {
  it("lists one record per species, the base form where it fits", () => {
    const target: NameAllTarget = [getCategory("type-fire"), getCategory("flag-starter")];
    const species = nameAllSpecies(target);
    const ids = new Set(species.map((pokemon) => pokemon.species));
    expect(ids.size).toBe(species.length);
    // Charizard, not its Megas or Gmax
    const charizard = species.find((pokemon) => pokemon.species === 6);
    expect(charizard?.form).toBe(null);
  });
});

describe("nameAllKindOf", () => {
  it("names a target's shape whichever way round it comes", () => {
    expect(nameAllKindOf([getCategory("type-fire"), getCategory("region-kanto")])).toBe("type+region");
    expect(nameAllKindOf([getCategory("region-kanto"), getCategory("type-fire")])).toBe("type+region");
    expect(nameAllKindOf([getCategory("type-fire"), getCategory("type-flying")])).toBe("type+type");
    expect(nameAllKindOf([getCategory("flag-fossil")])).toBe("special");
    expect(nameAllKindOf([getCategory("stage-final")])).toBe(null);
    expect(nameAllKindOf([getCategory("type-fire"), getCategory("stage-final")])).toBe(null);
  });
});

describe("nameAllCandidates", () => {
  it("keeps every shape's targets within the size limits", () => {
    for (const kind of ["type+type", "type+region", "type+special", "region+special", "special"] as const) {
      const candidates = nameAllCandidates(kind);
      expect(candidates.length).toBeGreaterThan(0);
      for (const target of candidates) {
        const count = nameAllSpecies(target).length;
        expect(count).toBeGreaterThanOrEqual(NAME_ALL_MIN);
        expect(count).toBeLessThanOrEqual(NAME_ALL_MAX);
        expect(nameAllKindOf(target)).toBe(kind);
      }
    }
    // a type pair once, not twice
    const typePairs = nameAllCandidates("type+type").map(nameAllKey);
    expect(new Set(typePairs).size).toBe(typePairs.length);
    // Legendary's eighty-odd are left out
    expect(nameAllCandidates("special").some((target) => target[0].id === "flag-legendary")).toBe(false);
  });
});

describe("pickNameAllTarget", () => {
  it("draws from the chosen shapes and avoids the round just played", () => {
    const first = pickNameAllTarget(merged, ["special"], { random: () => 0 });
    expect(nameAllKindOf(first)).toBe("special");
    const second = pickNameAllTarget(merged, ["special"], { random: () => 0, avoid: nameAllKey(first) });
    expect(nameAllKey(second)).not.toBe(nameAllKey(first));
  });
});

describe("nameAllTargetFrom", () => {
  it("reads a URL's target, only in a shape the round draws", () => {
    expect(nameAllTargetFrom(["type-fire", "type-flying"])?.map((category) => category.id)).toEqual([
      "type-fire",
      "type-flying",
    ]);
    expect(nameAllTargetFrom(["flag-fossil"])?.map((category) => category.id)).toEqual(["flag-fossil"]);
    expect(nameAllTargetFrom(["type-fire", "type-fire"])).toBe(null);
    expect(nameAllTargetFrom(["type-fire", "stage-final"])).toBe(null);
    expect(nameAllTargetFrom(["fun-pikachuClone"])).toBe(null);
    expect(nameAllTargetFrom(["nope"])).toBe(null);
  });
});
