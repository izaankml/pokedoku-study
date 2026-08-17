// The URL hash carries where you are: "#tab" plus each tab's own state
// after it — "#cards/region", "#browse/region-kanto/type-fire",
// "#drill/type-fire/flag-legendary" — so a refresh, a shared link or
// back/forward lands on the same view. Tab changes push a history entry;
// changes within a tab replace it, so Back always means "previous tab".

export function readHash() {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const [tab = "", ...rest] = raw.split("/");
  return { tab: tab.toLowerCase(), rest: rest.map((s) => decodeURIComponent(s)) };
}

export function writeHash(tab, rest = [], { push = false } = {}) {
  const hash = "#" + [tab.toLowerCase(), ...rest.map((s) => encodeURIComponent(s))].join("/");
  if (window.location.hash === hash) return;
  if (push) window.history.pushState(null, "", hash);
  else window.history.replaceState(null, "", hash);
}

// The state segments of the hash if it is for `tab`, else null.
export function hashStateFor(tab) {
  const { tab: t, rest } = readHash();
  return t === tab.toLowerCase() ? rest : null;
}

// Small JSON blobs in localStorage (in-progress board, current card).
export function loadJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveJson(key, value) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or unavailable — the app just won't remember this
  }
}
