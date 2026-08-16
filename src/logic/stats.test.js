import { describe, expect, it } from "vitest";
import { emptyBlock, mergeBlocks, smoothedAccuracy, withAttempt } from "./stats.js";

describe("stats", () => {
  it("records attempts immutably", () => {
    const block = emptyBlock("dev1");
    const next = withAttempt(block, {
      categories: ["type-fire", "region-unova"],
      pair: "region-unova|type-fire",
      correct: true,
    });
    expect(block.categories["type-fire"]).toBeUndefined();
    expect(next.categories["type-fire"]).toEqual({ a: 1, c: 1 });
    expect(next.categories["region-unova"]).toEqual({ a: 1, c: 1 });
    expect(next.pairs["region-unova|type-fire"]).toEqual({ a: 1, c: 1 });
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

  it("records flashcard attempts per species", () => {
    const next = withAttempt(emptyBlock("d"), {
      categories: ["region-unova"],
      speciesId: 495,
      correct: false,
    });
    expect(next.flashcards["495"]).toEqual({ a: 1, c: 0 });
  });
});
