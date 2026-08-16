// This device's answer history, persisted in localStorage. Cross-device
// sync (sync.js) merges blocks like this one from other devices; each
// device only ever writes its own block.
//
// Counts (a, c) merge by addition. Schedule state (s, t — see
// schedule.js) merges last-writer-wins by t: whichever device answered
// most recently owns the item's streak. That is only correct because a
// device computes its new streak from the *merged* state, not from its
// own block alone (see withAttempt).

const KEY = "pokedoku-study:stats:v1";

// Tables that carry schedule state in addition to counts.
const SCHEDULED_TABLES = ["pairs", "flashcards"];

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

export function emptyBlock(deviceId) {
  return {
    version: 1,
    deviceId: deviceId || randomId(),
    deviceName: "",
    categories: {}, // catId -> {a: attempts, c: correct}
    pairs: {}, // "catA|catB" -> {a, c, s: streak, t: lastSeen}
    flashcards: {}, // speciesId -> {a, c, s, t}
  };
}

export function loadBlock() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY));
    if (parsed && parsed.version === 1 && parsed.deviceId) return parsed;
  } catch {
    // corrupt storage -> start fresh
  }
  return emptyBlock();
}

export function saveBlock(block) {
  localStorage.setItem(KEY, JSON.stringify(block));
}

// A readable label for this device ("iPhone · Safari"), used to tell
// device blocks apart in the sync panel.
export function describeDevice(ua = navigator.userAgent, standalone = false) {
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Macintosh/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : /Linux/.test(ua)
              ? "Linux"
              : "Device";
  const browser = standalone
    ? "Home screen app"
    : /Edg\//.test(ua)
      ? "Edge"
      : /OPR\//.test(ua)
        ? "Opera"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Chrome\//.test(ua) || /CriOS/.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : "Browser";
  return `${os} · ${browser}`;
}

// What a block amounts to: how many answers it holds and when it was
// last used (newest schedule timestamp; blocks from before scheduling
// existed have none).
export function summarizeBlock(block) {
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
export function absorbBlock(own, other) {
  const next = structuredClone(own);
  for (const table of ["categories", ...SCHEDULED_TABLES]) {
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

function bump(table, key, correct) {
  const entry = table[key] || (table[key] = { a: 0, c: 0 });
  entry.a += 1;
  if (correct) entry.c += 1;
  return entry;
}

// `base` is the merged (cross-device) entry the streak continues from.
function bumpScheduled(table, key, correct, base, now) {
  const entry = bump(table, key, correct);
  entry.s = correct ? (base?.s ?? 0) + 1 : 0;
  entry.t = now;
}

// Returns a NEW block (so React state updates propagate). `merged` is the
// current cross-device merge; without it the streak continues from this
// device's own entry.
export function withAttempt(
  block,
  { categories = [], pair, speciesId, correct },
  { merged = null, now = Date.now() } = {}
) {
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
export function smoothedAccuracy(entry) {
  const { a, c } = entry || { a: 0, c: 0 };
  return (c + 1) / (a + 2);
}

// Merge stat blocks from several devices for display and weighting.
export function mergeBlocks(blocks) {
  const merged = { categories: {}, pairs: {}, flashcards: {}, attempts: 0 };
  for (const block of blocks) {
    if (!block || block.version !== 1) continue;
    for (const table of ["categories", ...SCHEDULED_TABLES]) {
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
