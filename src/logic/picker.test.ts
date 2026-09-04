import { describe, expect, it } from "vitest";
import { CATEGORIES, getCategory } from "../data/categories.ts";
import { POKEMON } from "../data/pokedex.ts";
import { pairIsValid, pairKey } from "./matching.ts";
import { drillPairFor, pickDrillPair, pickFlashcard } from "./picker.ts";
import { mergeBlocks } from "./stats.ts";

const T0 = 1_700_000_000_000;
const DAY = 86400e3;

// Everything except two Kanto Pokémon (same gen bias).
const [p1, p2] = POKEMON.filter((p) => p.gen === 1).slice(0, 2);
const excludeAllBut = new Set(POKEMON.filter((p) => p !== p1 && p !== p2).map((p) => p.id));

describe("pickFlashcard (Region deck)", () => {
  it("strongly prefers a due card over one seen moments ago", () => {
    const merged = mergeBlocks([]);
    merged.flashcards[String(p1.id)] = { a: 1, c: 1, s: 1, t: T0 }; // just seen
    // p2 unseen -> due factor 1; p1 -> 0.05. Same accuracy weight.
    const seen = new Set();
    for (let i = 0; i < 20; i++) {
      const roll = (i + 0.5) / 20;
      seen.add(pickFlashcard(merged, { deckId: "region", exclude: excludeAllBut, random: () => roll, now: T0 }).pokemon);
    }
    // p1 only wins the bottom ~5% of rolls.
    expect(seen.has(p2)).toBe(true);
    expect([...seen].filter((p) => p === p1).length).toBeLessThanOrEqual(1);
  });

  it("brings an overdue card back even if it is well known", () => {
    const merged = mergeBlocks([]);
    merged.flashcards[String(p1.id)] = { a: 5, c: 5, s: 2, t: T0 - 30 * DAY }; // 10x overdue
    merged.flashcards[String(p2.id)] = { a: 5, c: 5, s: 2, t: T0 }; // just seen
    const pick = pickFlashcard(merged, { deckId: "region", exclude: excludeAllBut, random: () => 0.9, now: T0 });
    expect(pick.pokemon).toBe(p1);
  });

  it("deals a due card before any new one, however the roll falls", () => {
    const merged = mergeBlocks([]);
    // p1 barely due (a day's interval, a day and a bit ago); p2 never seen
    merged.flashcards[String(p1.id)] = { a: 3, c: 3, s: 1, t: T0 - 1.1 * DAY };
    for (let index = 0; index < 20; index++) {
      const roll = (index + 0.5) / 20;
      const pick = pickFlashcard(merged, { deckId: "region", exclude: excludeAllBut, random: () => roll, now: T0 });
      expect(pick.pokemon).toBe(p1);
    }
    // once it's answered (seen just now), the queue is empty and p2 gets its turn
    merged.flashcards[String(p1.id)] = { a: 4, c: 4, s: 2, t: T0 };
    const after = pickFlashcard(merged, { deckId: "region", exclude: excludeAllBut, random: () => 0.9, now: T0 });
    expect(after.pokemon).toBe(p2);
  });
});

describe("drillPairFor", () => {
  it("pairs the category with a valid partner from another group", () => {
    const merged = mergeBlocks([]);
    for (let i = 0; i < 10; i++) {
      const [a, b] = drillPairFor("type-fire", merged, { random: () => i / 10, now: T0 });
      expect(a.id).toBe("type-fire");
      expect(b.group).not.toBe("type");
      expect(pairIsValid(a.id, b.id)).toBe(true);
    }
  });

  it("prefers a partner the pair has already been practised with", () => {
    const merged = mergeBlocks([]);
    merged.pairs[pairKey("type-fire", "flag-legendary")] = { a: 2, c: 1, s: 0, t: T0 - 30 * DAY };
    for (let i = 0; i < 10; i++) {
      const [, partner] = drillPairFor("type-fire", merged, { random: () => i / 10, now: T0 });
      expect(partner.id).toBe("flag-legendary");
    }
  });
});

describe("pickDrillPair", () => {
  it("returns a valid pair and honours avoid", () => {
    const merged = mergeBlocks([]);
    let seed = 7;
    const random = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const first = pickDrillPair(merged, { random, now: T0 });
    expect(pairIsValid(first[0].id, first[1].id)).toBe(true);
    const avoid = new Set([pairKey(first[0].id, first[1].id)]);
    for (let i = 0; i < 20; i++) {
      const [a, b] = pickDrillPair(merged, { avoid, random, now: T0 });
      expect(pairIsValid(a.id, b.id)).toBe(true);
      expect(avoid.has(pairKey(a.id, b.id))).toBe(false);
    }
  });

  it("fades out a category whose pairs were all just answered", () => {
    const merged = mergeBlocks([]);
    const kanto = getCategory("region-kanto");
    for (const c of CATEGORIES) {
      if (pairIsValid(kanto.id, c.id)) merged.pairs[pairKey(kanto.id, c.id)] = { a: 1, c: 1, s: 1, t: T0 };
    }
    let seed = 3;
    const random = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    let hits = 0;
    const N = 300;
    for (let i = 0; i < N; i++) {
      const [a, b] = pickDrillPair(merged, { random, now: T0 });
      if (a === kanto || b === kanto) hits++;
    }
    // Unweighted, Kanto shows up in a decent share of pairs; suppressed it
    // should be rare (both steps multiply its weight by ~0.05).
    expect(hits / N).toBeLessThan(0.03);
  });
});
