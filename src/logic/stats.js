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
