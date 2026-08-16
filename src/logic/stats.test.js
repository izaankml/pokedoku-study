import { describe, expect, it } from "vitest";
import { emptyBlock, mergeBlocks, smoothedAccuracy, withAttempt } from "./stats.js";

const T0 = 1_700_000_000_000;

describe("stats", () => {
  it("records attempts immutably", () => {
    const block = emptyBlock("dev1");
    const next = withAttempt(
      block,
      {
        categories: ["type-fire", "region-unova"],
        pair: "region-unova|type-fire",
        correct: true,
      },
      { now: T0 }
    );
    expect(block.categories["type-fire"]).toBeUndefined();
    expect(next.categories["type-fire"]).toEqual({ a: 1, c: 1 });
    expect(next.categories["region-unova"]).toEqual({ a: 1, c: 1 });
    expect(next.pairs["region-unova|type-fire"]).toEqual({ a: 1, c: 1, s: 1, t: T0 });
  });

  it("merges device blocks additively", () => {
    const a = withAttempt(emptyBlock("a"), { categories: ["mono"], correct: true });
    const b = withAttempt(
      withAttempt(emptyBlock("b"), { categories: ["mono"], correct: false }),
      { categories: ["mono"], correct: false }
    );
    const merged = mergeBlocks([a, b]);
    expect(merged.categories["mono"]).toEqual({ a: 3, c: 1 });
  });

  it("smooths accuracy toward 0.5 with no evidence", () => {
    expect(smoothedAccuracy(undefined)).toBe(0.5);
    expect(smoothedAccuracy({ a: 2, c: 2 })).toBe(0.75);
  });

  it("records flashcard attempts per species with schedule state", () => {
    const next = withAttempt(
      emptyBlock("d"),
      { categories: ["region-unova"], speciesId: 495, correct: false },
      { now: T0 }
    );
    expect(next.flashcards["495"]).toEqual({ a: 1, c: 0, s: 0, t: T0 });
  });

  it("grows the streak on correct and resets it on a miss", () => {
    let b = emptyBlock("d");
    b = withAttempt(b, { speciesId: 1, correct: true }, { now: T0 });
    b = withAttempt(b, { speciesId: 1, correct: true }, { now: T0 + 1 });
    expect(b.flashcards["1"]).toMatchObject({ s: 2, t: T0 + 1 });
    b = withAttempt(b, { speciesId: 1, correct: false }, { now: T0 + 2 });
    expect(b.flashcards["1"]).toMatchObject({ a: 3, c: 2, s: 0, t: T0 + 2 });
  });

  it("continues the streak from the merged (cross-device) state", () => {
    // Phone has answered Chandelure correctly 4 times.
    let phone = emptyBlock("phone");
    for (let i = 0; i < 4; i++) {
      phone = withAttempt(phone, { speciesId: 609, correct: true }, { now: T0 + i });
    }
    const laptop = emptyBlock("laptop");
    const merged = mergeBlocks([phone, laptop]);
    const next = withAttempt(
      laptop,
      { speciesId: 609, correct: true },
      { merged, now: T0 + 100 }
    );
    // Laptop's own counts start at 1, but the streak carries on from 4.
    expect(next.flashcards["609"]).toEqual({ a: 1, c: 1, s: 5, t: T0 + 100 });
  });

  it("merges schedule state last-writer-wins by t, counts by sum", () => {
    let phone = emptyBlock("phone");
    for (let i = 0; i < 4; i++) {
      phone = withAttempt(phone, { speciesId: 609, correct: true }, { now: T0 + i });
    }
    let laptop = emptyBlock("laptop");
    // Laptop, synced, misses it later: streak resets everywhere.
    laptop = withAttempt(
      laptop,
      { speciesId: 609, correct: false },
      { merged: mergeBlocks([phone, laptop]), now: T0 + 50 }
    );
    const merged = mergeBlocks([phone, laptop]);
    expect(merged.flashcards["609"]).toEqual({ a: 5, c: 4, s: 0, t: T0 + 50 });
    // Order of blocks does not matter.
    expect(mergeBlocks([laptop, phone]).flashcards["609"]).toEqual(merged.flashcards["609"]);
  });

  it("stale device under-counts the streak but never loses the item", () => {
    let phone = emptyBlock("phone");
    for (let i = 0; i < 4; i++) {
      phone = withAttempt(phone, { speciesId: 609, correct: true }, { now: T0 + i });
    }
    // Laptop answers without having pulled phone's block (stale merge).
    let laptop = emptyBlock("laptop");
    laptop = withAttempt(
      laptop,
      { speciesId: 609, correct: true },
      { merged: mergeBlocks([laptop]), now: T0 + 50 }
    );
    const merged = mergeBlocks([phone, laptop]);
    // Newest write wins: streak 1 (not 5) — an extra review, self-healing.
    expect(merged.flashcards["609"]).toMatchObject({ a: 5, c: 5, s: 1, t: T0 + 50 });
  });

  it("entries without schedule state never win the merge", () => {
    const legacy = emptyBlock("old");
    legacy.flashcards["1"] = { a: 10, c: 10 }; // pre-scheduling block
    const modern = withAttempt(emptyBlock("new"), { speciesId: 1, correct: true }, { now: T0 });
    for (const order of [[legacy, modern], [modern, legacy]]) {
      expect(mergeBlocks(order).flashcards["1"]).toEqual({ a: 11, c: 11, s: 1, t: T0 });
    }
    // Legacy-only entries simply have no schedule.
    expect(mergeBlocks([legacy]).flashcards["1"]).toEqual({ a: 10, c: 10 });
  });
});
