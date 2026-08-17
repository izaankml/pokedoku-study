// The URL hash carries where you are: "#tab" plus each tab's own state
// after it — "#cards/region", "#browse/region-kanto/type-fire",
// "#drill/type-fire/flag-legendary" — so a refresh, a shared link or
// back/forward lands on the same view. Tab changes push a history entry;
// changes within a tab replace it, so Back always means "previous tab".
// An open detail sheet is a trailing "pokemon-<slug>" segment
// ("#browse/region-kanto/pokemon-eevee"): opening pushes an entry, so Back
// closes the sheet; closing it pops that entry, so Back never reopens it.

import { useEffect, useState } from "react";

const DETAIL = "pokemon-";

export function readHash() {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const [tab = "", ...rest] = raw.split("/").map((s) => decodeURIComponent(s));
  const last = rest[rest.length - 1];
  const detail = last && last.startsWith(DETAIL) ? rest.pop().slice(DETAIL.length) : null;
  return { tab: tab.toLowerCase(), rest, detail };
}

// `detail` undefined keeps whatever sheet is open (a tab rewriting its own
// state doesn't close it), null drops it, a slug opens that Pokémon.
export function writeHash(tab, rest = [], { push = false, detail, state = null } = {}) {
  const slug = detail === undefined ? readHash().detail : detail;
  const segs = [tab.toLowerCase(), ...rest, ...(slug ? [DETAIL + slug] : [])];
  const hash = "#" + segs.map((s) => encodeURIComponent(s)).join("/");
  if (window.location.hash === hash) return;
  if (push) window.history.pushState(state, "", hash);
  else window.history.replaceState(state, "", hash);
}

// The state segments of the hash if it is for `tab`, else null.
export function hashStateFor(tab) {
  const { tab: t, rest } = readHash();
  return t === tab.toLowerCase() ? rest : null;
}

// The open detail sheet, synced with the hash. `resolve(slug)` returns the
// Pokémon that slug means here (or null — a slug left over from another
// view is dropped from the hash). Returns [pokemon | null, open, close].
export function useDetailHash(resolve) {
  const [selected, setSelected] = useState(() => resolve(readHash().detail));
  useEffect(() => {
    // Back/forward (or a hand-edited hash) opens or closes the sheet
    const onHash = () => setSelected(resolve(readHash().detail));
    window.addEventListener("popstate", onHash);
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener("popstate", onHash);
      window.removeEventListener("hashchange", onHash);
    };
  }, [resolve]);
  useEffect(() => {
    const { tab, rest, detail } = readHash();
    if (detail && !selected) writeHash(tab, rest, { detail: null });
  }, [selected]);
  const open = (pokemon) => {
    setSelected(pokemon);
    const { tab, rest } = readHash();
    writeHash(tab, rest, { detail: pokemon.name, push: true, state: { detail: pokemon.name } });
  };
  const close = () => {
    setSelected(null);
    // the entry we pushed on open — pop it; a sheet opened from a pasted or
    // refreshed link has none, so just drop the segment
    if (window.history.state?.detail) window.history.back();
    else {
      const { tab, rest } = readHash();
      writeHash(tab, rest, { detail: null });
    }
  };
  return [selected, open, close];
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
