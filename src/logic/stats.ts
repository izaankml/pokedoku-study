// This device's answer history, persisted in localStorage. Cross-device
// sync (sync.ts) merges blocks like this one from other devices; each
// device only ever writes its own block.
//
// Counts (a, c) merge by addition. Schedule state (s, t — see
// schedule.ts) merges last-writer-wins by t: whichever device answered
// most recently owns the item's streak. That is only correct because a
// device computes its new streak from the *merged* state, not from its
// own block alone (see withAttempt).

const KEY = "pokedoku-study:stats:v1";

// One item's history: attempts and correct answers, plus — in the
// scheduled tables — the current streak and when it was last seen.
export interface StatEntry {
  a: number;
  c: number;
  // consecutive-correct streak (scheduled tables only)
  s?: number;
  // last seen, epoch ms (scheduled tables only)
  t?: number;
}

export type StatTable = Record<string, StatEntry>;

// What every device's block and the cross-device merge have in common.
export interface StatTables {
  // catId -> {a: attempts, c: correct}
  categories: StatTable;
  // "catA|catB" -> {a, c, s: streak, t: lastSeen}
  pairs: StatTable;
  // flashcard key (see flashcards.ts cardKey) -> {a, c, s, t}
  flashcards: StatTable;
}

export type TableName = keyof StatTables;

// One device's history, as stored and as synced.
export interface StatsBlock extends StatTables {
  version: 1;
  deviceId: string;
  deviceName: string;
}

// The cross-device merge of several blocks.
export interface MergedStats extends StatTables {
  // total answers across every category
  attempts: number;
}

export interface AttemptEvent {
  // the categories the attempt counts for
  categories?: string[];
  // the drill pair key (matching.ts pairKey), when a pair was asked
  pair?: string;
  // the flashcard key, when a card was answered
  speciesId?: string | number;
  correct: boolean;
}

// Tables that carry schedule state in addition to counts.
const SCHEDULED_TABLES: TableName[] = ["pairs", "flashcards"];
const ALL_TABLES: TableName[] = ["categories", ...SCHEDULED_TABLES];

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function emptyBlock(deviceId?: string): StatsBlock {
  return {
    version: 1,
    deviceId: deviceId || randomId(),
    deviceName: "",
    categories: {},
    pairs: {},
    flashcards: {},
  };
}

export function loadBlock(): StatsBlock {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (isStatsBlock(parsed)) return parsed;
  } catch {
    // corrupt storage -> start fresh
  }
  return emptyBlock();
}

function isStatsBlock(value: unknown): value is StatsBlock {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { version?: unknown }).version === 1 &&
    typeof (value as { deviceId?: unknown }).deviceId === "string" &&
    (value as { deviceId: string }).deviceId !== ""
  );
}

export function saveBlock(block: StatsBlock): void {
  localStorage.setItem(KEY, JSON.stringify(block));
}

// A readable label for this device ("iPhone · Safari"), used to tell
// device blocks apart in the sync panel.
export function describeDevice(userAgent: string = navigator.userAgent, standalone = false): string {
  const os = /iPhone/.test(userAgent)
    ? "iPhone"
    : /iPad/.test(userAgent) || (/Macintosh/.test(userAgent) && navigator.maxTouchPoints > 1)
      ? "iPad"
      : /Android/.test(userAgent)
        ? "Android"
        : /Macintosh/.test(userAgent)
          ? "Mac"
          : /Windows/.test(userAgent)
            ? "Windows"
            : /Linux/.test(userAgent)
              ? "Linux"
              : "Device";
  const browser = standalone
    ? "Home screen app"
    : /Edg\//.test(userAgent)
      ? "Edge"
      : /OPR\//.test(userAgent)
        ? "Opera"
        : /Firefox\//.test(userAgent)
          ? "Firefox"
          : /Chrome\//.test(userAgent) || /CriOS/.test(userAgent)
            ? "Chrome"
            : /Safari\//.test(userAgent)
              ? "Safari"
              : "Browser";
  return `${os} · ${browser}`;
}

export interface BlockSummary {
  attempts: number;
  lastActive: number | null;
}

// What a block amounts to: how many answers it holds and when it was
// last used (newest schedule timestamp; blocks from before scheduling
// existed have none).
export function summarizeBlock(block: StatsBlock): BlockSummary {
  let attempts = 0;
  let lastActive = 0;
  for (const entry of Object.values(block.categories || {})) attempts += entry.a;
  for (const table of SCHEDULED_TABLES) {
    for (const entry of Object.values(block[table] || {})) {
      if (entry.t && entry.t > lastActive) lastActive = entry.t;
    }
  }
  return { attempts, lastActive: lastActive || null };
}

// Folds another device's history into this block (counts add up; the
// later schedule state wins) so the other block can be dropped without
// losing anything. Returns a NEW block.
export function absorbBlock(own: StatsBlock, other: StatsBlock): StatsBlock {
  const next = structuredClone(own);
  for (const table of ALL_TABLES) {
    for (const [key, entry] of Object.entries(other[table] || {})) {
      const mine = next[table][key] || (next[table][key] = { a: 0, c: 0 });
      mine.a += entry.a;
      mine.c += entry.c;
      if (SCHEDULED_TABLES.includes(table) && entry.t && entry.t > (mine.t ?? 0)) {
        mine.s = entry.s ?? 0;
        mine.t = entry.t;
      }
    }
  }
  return next;
}

function bump(table: StatTable, key: string, correct: boolean): StatEntry {
  const entry = table[key] || (table[key] = { a: 0, c: 0 });
  entry.a += 1;
  if (correct) entry.c += 1;
  return entry;
}

// `base` is the merged (cross-device) entry the streak continues from.
function bumpScheduled(
  table: StatTable,
  key: string,
  correct: boolean,
  base: StatEntry | undefined,
  now: number,
): void {
  const entry = bump(table, key, correct);
  entry.s = correct ? (base?.s ?? 0) + 1 : 0;
  entry.t = now;
}

export interface WithAttemptOptions {
  // the current cross-device merge; without it the streak continues from
  // this device's own entry
  merged?: MergedStats | null;
  now?: number;
}

// Returns a NEW block (so React state updates propagate).
export function withAttempt(
  block: StatsBlock,
  { categories = [], pair, speciesId, correct }: AttemptEvent,
  { merged = null, now = Date.now() }: WithAttemptOptions = {},
): StatsBlock {
  const next = structuredClone(block);
  for (const catId of categories) bump(next.categories, catId, correct);
  if (pair) {
    const base = merged ? merged.pairs[pair] : next.pairs[pair];
    bumpScheduled(next.pairs, pair, correct, base, now);
  }
  if (speciesId != null) {
    const key = String(speciesId);
    const base = merged ? merged.flashcards[key] : next.flashcards[key];
    bumpScheduled(next.flashcards, key, correct, base, now);
  }
  return next;
}

// Laplace-smoothed accuracy: unseen -> 0.5, converges with evidence.
export function smoothedAccuracy(entry: StatEntry | undefined): number {
  const { a, c } = entry || { a: 0, c: 0 };
  return (c + 1) / (a + 2);
}

// Merge stat blocks from several devices for display and weighting.
export function mergeBlocks(blocks: ReadonlyArray<StatsBlock | null | undefined>): MergedStats {
  const merged: MergedStats = { categories: {}, pairs: {}, flashcards: {}, attempts: 0 };
  for (const block of blocks) {
    if (!block || block.version !== 1) continue;
    for (const table of ALL_TABLES) {
      const scheduled = SCHEDULED_TABLES.includes(table);
      for (const [key, { a, c, s, t }] of Object.entries(block[table] || {})) {
        const entry = merged[table][key] || (merged[table][key] = { a: 0, c: 0 });
        entry.a += a;
        entry.c += c;
        if (table === "categories") merged.attempts += a;
        // Last writer wins on schedule state; entries without `t` (from
        // before scheduling existed) never win.
        if (scheduled && t && t > (entry.t ?? 0)) {
          entry.s = s ?? 0;
          entry.t = t;
        }
      }
    }
  }
  return merged;
}
