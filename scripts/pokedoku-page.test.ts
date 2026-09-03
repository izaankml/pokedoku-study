import { describe, expect, it } from "vitest";
import { extractEmbeddedPuzzle } from "./pokedoku-page.ts";

// a puzzle split across two pushes mid-string, the way Next streams it
const push = (chunk: string) => `<script>self.__next_f.push(${JSON.stringify([1, chunk])})</script>`;
const puzzle = {
  createdAt: "2026-09-02T04:00:00Z",
  type: "AUTOMATIC",
  x1: { type: "POKEMON_TYPE", obj: "rock", excludedPokemonIds: [], excludedForms: [] },
  y1: { type: "FIRST_PARTNER", obj: true, excludedPokemonIds: [25, 133], excludedForms: [] },
  id: 1665,
  date: "2026-09-02",
  description: 'a "quoted" note with a } brace',
  creator: null,
};
const line = `2:["$","div",null,{"puzzle":${JSON.stringify(puzzle)},"other":{"puzzleDate":"2026-09-01"}}]\n`;
const html =
  `<html><body>${push("0:[\"$\",\"$L1\",null,{}]\n")}${push(line.slice(0, 70))}${push(line.slice(70))}` +
  `<script>self.__next_f.push([0])</script></body></html>`;

describe("extractEmbeddedPuzzle", () => {
  it("reassembles the streamed payload and returns the page's puzzle", () => {
    expect(extractEmbeddedPuzzle(html)).toEqual(puzzle);
  });

  it("returns null for a page without one", () => {
    expect(extractEmbeddedPuzzle(`<html>${push('1:{"puzzleDate":"2026-09-01"}')}</html>`)).toBeNull();
    expect(extractEmbeddedPuzzle("<html></html>")).toBeNull();
  });
});
