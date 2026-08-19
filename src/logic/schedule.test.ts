import { describe, expect, it } from "vitest";
import {
  DUE_MAX,
  DUE_MIN,
  INTERVALS_MS,
  dueFactor,
  formatInterval,
  intervalFor,
  nextInterval,
  scheduleStatus,
  scheduleSummary,
} from "./schedule.ts";
import type { StatTable } from "./stats.ts";

const DAY = 86400e3;
const T0 = 1_700_000_000_000;

describe("schedule", () => {
  it("indexes intervals by streak and saturates", () => {
    expect(intervalFor(0)).toBe(10 * 60e3);
    expect(intervalFor(1)).toBe(DAY);
    expect(intervalFor(-3)).toBe(intervalFor(0));
    expect(intervalFor(99)).toBe(INTERVALS_MS[INTERVALS_MS.length - 1]);
    expect(nextInterval({ s: 2 }, true)).toBe(intervalFor(3));
    expect(nextInterval({ s: 2 }, false)).toBe(intervalFor(0));
    expect(nextInterval(undefined, true)).toBe(intervalFor(1));
  });

  it("is neutral for unscheduled entries", () => {
    expect(dueFactor(undefined, T0)).toBe(1);
    expect(dueFactor({ a: 3, c: 1 }, T0)).toBe(1);
  });

  it("suppresses just-seen items and boosts overdue ones, clamped", () => {
    expect(dueFactor({ s: 1, t: T0 }, T0)).toBe(DUE_MIN);
    expect(dueFactor({ s: 1, t: T0 }, T0 + DAY / 2)).toBeCloseTo(0.5);
    expect(dueFactor({ s: 1, t: T0 }, T0 + DAY)).toBeCloseTo(1);
    expect(dueFactor({ s: 1, t: T0 }, T0 + 30 * DAY)).toBe(DUE_MAX);
  });

  it("classifies status", () => {
    expect(scheduleStatus(undefined, T0)).toBe("new");
    expect(scheduleStatus({ a: 1, c: 1 }, T0)).toBe("new");
    expect(scheduleStatus({ s: 1, t: T0 }, T0)).toBe("learning");
    expect(scheduleStatus({ s: 1, t: T0 }, T0 + DAY)).toBe("due");
    expect(scheduleStatus({ s: 5, t: T0 }, T0)).toBe("mastered");
    expect(scheduleStatus({ s: 5, t: T0 }, T0 + 40 * DAY)).toBe("due");
  });

  it("summarises a table over a key set", () => {
    const table: StatTable = {
      1: { a: 1, c: 1, s: 1, t: T0 },
      2: { a: 1, c: 1, s: 1, t: T0 - 2 * DAY },
      3: { a: 6, c: 6, s: 6, t: T0 },
    };
    expect(scheduleSummary(table, ["1", "2", "3", "4"], T0)).toEqual({
      new: 1,
      due: 1,
      learning: 1,
      mastered: 1,
    });
  });

  it("formats intervals", () => {
    expect(formatInterval(10 * 60e3)).toBe("10 min");
    expect(formatInterval(DAY)).toBe("1 day");
    expect(formatInterval(3 * DAY)).toBe("3 days");
  });
});
