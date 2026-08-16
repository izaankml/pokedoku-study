// This device's answer history, persisted in localStorage. Cross-device
// sync (sync.js) merges blocks like this one from other devices; each
// device only ever writes its own block.

const KEY = "pokedoku-study:stats:v1";

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

export function emptyBlock(deviceId) {
  return {
    version: 1,
    deviceId: deviceId || randomId(),
    deviceName: "",
    categories: {}, // catId -> {a: attempts, c: correct}
    pairs: {}, // "catA|catB" -> {a, c}
    flashcards: {}, // speciesId -> {a, c}
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
}

// Returns a NEW block (so React state updates propagate).
export function withAttempt(block, { categories = [], pair, speciesId, correct }) {
  const next = structuredClone(block);
  for (const catId of categories) bump(next.categories, catId, correct);
  if (pair) bump(next.pairs, pair, correct);
  if (speciesId != null) bump(next.flashcards, String(speciesId), correct);
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
    for (const table of ["categories", "pairs", "flashcards"]) {
      for (const [key, { a, c }] of Object.entries(block[table] || {})) {
        const entry = merged[table][key] || (merged[table][key] = { a: 0, c: 0 });
        entry.a += a;
        entry.c += c;
        if (table === "categories") merged.attempts += a;
      }
    }
  }
  return merged;
}
