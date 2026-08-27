import { describe, expect, it } from "vitest";
import type { PickStatsPuzzle } from "../src/data/types.ts";
import { archiveDocJson, toFirestoreFields, toFirestoreValue } from "./firestore-archive.ts";

const puzzle: PickStatsPuzzle = {
  id: 1564,
  date: "2026-08-26",
  spec: { x1: { type: "LEGENDARY", obj: true, excludedForms: ["mega"] } },
  cells: [
    {
      total: 100,
      picks: [
        [25, 60],
        [133, 40],
      ],
    },
  ],
};

describe("archiveDocJson", () => {
  it("turns nested pick arrays into maps (Firestore forbids arrays of arrays)", () => {
    const doc = archiveDocJson(puzzle);
    expect(doc.cells).toEqual([{ total: 100, picks: { "25": 60, "133": 40 } }]);
  });

  it("keeps spec and date only when present", () => {
    const bare = archiveDocJson({ id: 7, cells: [] });
    expect(Object.keys(bare)).toEqual(["id", "cells"]);
  });
});

describe("toFirestoreValue", () => {
  it("types scalars the way the REST API wants them", () => {
    expect(toFirestoreValue(3)).toEqual({ integerValue: "3" });
    expect(toFirestoreValue(0.5)).toEqual({ doubleValue: 0.5 });
    expect(toFirestoreValue("x")).toEqual({ stringValue: "x" });
    expect(toFirestoreValue(true)).toEqual({ booleanValue: true });
    expect(toFirestoreValue(null)).toEqual({ nullValue: null });
  });

  it("encodes a whole archive doc without nested arrayValues", () => {
    const fields = toFirestoreFields(archiveDocJson(puzzle));
    const hasNestedArray = (value: unknown, insideArray: boolean): boolean => {
      if (typeof value !== "object" || value === null) return false;
      const record = value as Record<string, unknown>;
      if ("arrayValue" in record) {
        if (insideArray) return true;
        const values = (record.arrayValue as { values?: unknown[] }).values ?? [];
        return values.some((item) => hasNestedArray(item, true));
      }
      if ("mapValue" in record) {
        const nested = (record.mapValue as { fields?: Record<string, unknown> }).fields ?? {};
        return Object.values(nested).some((item) => hasNestedArray(item, false));
      }
      return false;
    };
    expect(Object.values(fields).some((value) => hasNestedArray(value, false))).toBe(false);
    expect(fields.id).toEqual({ integerValue: "1564" });
  });
});
