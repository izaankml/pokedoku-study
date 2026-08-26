// Spaced-review scheduling for flashcards and drill pairs.
//
// Each scheduled stats entry carries `s` (consecutive-correct streak) and
// `t` (last seen, epoch ms). A correct answer bumps the streak and pushes
// the next review out; a miss resets it so the item comes back within the
// session. There is no ease factor — the streak alone indexes the table.

import type { StatEntry, StatTable } from "./stats.ts";

const MIN = 60e3;
const DAY = 86400e3;

export const INTERVALS_MS = [
  10 * MIN, // s=0: just missed or brand new — back later this session
  1 * DAY,
  3 * DAY,
  7 * DAY,
  16 * DAY,
  35 * DAY,
  80 * DAY,
  180 * DAY, // s>=7: effectively retired
];

// Streak at which an item counts as mastered (interval >= 35 days).
export const MASTERED_STREAK = 5;

// Bounds on the due multiplier applied to selection weights: a card seen
// seconds ago is 20x less likely; a badly overdue card is at most 3x more.
export const DUE_MIN = 0.05;
export const DUE_MAX = 3;

// Only the schedule part of an entry matters here, and an entry may lack
// it (recorded before scheduling existed) or be missing altogether.
export type ScheduleEntry = Partial<StatEntry> | undefined;

export function intervalFor(streak: number | undefined): number {
  const clamped = Math.max(0, (streak ?? 0) | 0);
  return INTERVALS_MS[Math.min(clamped, INTERVALS_MS.length - 1)];
}

// Interval that would apply after answering `correct` from state `entry`.
export function nextInterval(entry: ScheduleEntry, correct: boolean): number {
  return intervalFor(correct ? (entry?.s ?? 0) + 1 : 0);
}

// Multiplier for selection weight. Unscheduled entries (never seen, or
// recorded before scheduling existed) are neutral.
export function dueFactor(entry: ScheduleEntry, now: number): number {
  if (!entry || !entry.t) return 1;
  const ratio = (now - entry.t) / intervalFor(entry.s);
  return Math.min(DUE_MAX, Math.max(DUE_MIN, ratio));
}

export type ScheduleStatus = "new" | "due" | "learning" | "mastered";

// When the entry's next review falls; 0 for never-seen entries.
export function dueAt(entry: ScheduleEntry): number {
  return entry?.t ? entry.t + intervalFor(entry.s) : 0;
}

export function scheduleStatus(entry: ScheduleEntry, now: number): ScheduleStatus {
  if (!entry || !entry.t) return "new";
  if (now >= dueAt(entry)) return "due";
  return (entry.s ?? 0) >= MASTERED_STREAK ? "mastered" : "learning";
}

export type ScheduleSummary = Record<ScheduleStatus, number>;

// Counts of scheduleStatus over a set of keys in a stats table.
export function scheduleSummary(table: StatTable, keys: Iterable<string>, now: number): ScheduleSummary {
  const out: ScheduleSummary = { new: 0, due: 0, learning: 0, mastered: 0 };
  for (const key of keys) out[scheduleStatus(table[key], now)] += 1;
  return out;
}

export function formatInterval(ms: number): string {
  if (ms < DAY) return `${Math.round(ms / MIN)} min`;
  const days = Math.round(ms / DAY);
  return days === 1 ? "1 day" : `${days} days`;
}
