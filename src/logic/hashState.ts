// The URL hash carries where you are: "#tab" plus each tab's own state
// after it — "#cards/region", "#browse/region-kanto/type-fire",
// "#drill/type-fire/flag-legendary" — so a refresh, a shared link or
// back/forward lands on the same view. Tab changes push a history entry;
// changes within a tab replace it, so Back always means "previous tab".
// An open detail sheet is a trailing "pokemon-<slug>" segment
// ("#browse/region-kanto/pokemon-eevee"): opening pushes an entry, so Back
// closes the sheet; closing it pops that entry, so Back never reopens it.
// A sheet opened from within a sheet (tapping a tile of the evolution
// line) pushes another, so Back returns to the previous sheet while ×
// closes them all (the entry's state counts the depth).

import { useCallback, useEffect, useState } from "react";
import type { Pokemon } from "../data/types.ts";

const DETAIL = "pokemon-";

export interface HashState {
  tab: string;
  // the tab's own segments
  rest: string[];
  // the slug of the open detail sheet, if any
  detail: string | null;
}

export function readHash(): HashState {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const [tab = "", ...rest] = raw.split("/").map((segment) => decodeURIComponent(segment));
  const last = rest[rest.length - 1];
  const detail = last && last.startsWith(DETAIL) ? (rest.pop() as string).slice(DETAIL.length) : null;
  return { tab: tab.toLowerCase(), rest, detail };
}

// What a detail sheet's history entry remembers: how many sheets deep it is.
interface DetailHistoryState {
  detail: string;
  depth: number;
}

export interface WriteHashOptions {
  // push a history entry (a tab change) rather than replace the current one
  push?: boolean;
  // undefined keeps whatever sheet is open (a tab rewriting its own state
  // doesn't close it), null drops it, a slug opens that Pokémon
  detail?: string | null;
  state?: DetailHistoryState | null;
}

export function writeHash(tab: string, rest: string[] = [], { push = false, detail, state = null }: WriteHashOptions = {}): void {
  const slug = detail === undefined ? readHash().detail : detail;
  const segments = [tab.toLowerCase(), ...rest, ...(slug ? [DETAIL + slug] : [])];
  const hash = "#" + segments.map((segment) => encodeURIComponent(segment)).join("/");
  if (window.location.hash === hash) return;
  if (push) window.history.pushState(state, "", hash);
  else window.history.replaceState(state, "", hash);
}

// The state segments of the hash if it is for `tab`, else null.
export function hashStateFor(tab: string): string[] | null {
  const { tab: current, rest } = readHash();
  return current === tab.toLowerCase() ? rest : null;
}

// Jump to another tab with the given state segments (a clicked pill into
// Browse, the Stats tab's Cards/Drill entry points). history.pushState
// fires no events, so the synthetic hashchange is what tells App to
// switch tab — and the target, if already mounted, to re-read its state.
// With a detail sheet open, its pushed history entry is REPLACED rather
// than pushed onto: otherwise Back would land on the sheet the user just
// left and reopen it.
export function jumpToTab(tab: string, rest: string[] = []): void {
  writeHash(tab, rest, { push: historyDepth() === 0, detail: null });
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export function jumpToBrowse(catIds: string[]): void {
  jumpToTab("browse", catIds.filter(Boolean));
}

// The depth recorded in the current history entry, if a sheet pushed it.
function historyDepth(): number {
  const state: unknown = window.history.state;
  return typeof state === "object" && state !== null && typeof (state as { depth?: unknown }).depth === "number"
    ? (state as DetailHistoryState).depth
    : 0;
}

// Runs `handler` whenever the location's hash may have changed: real
// navigation (hashchange/popstate) and jumpToBrowse's synthetic event.
// `handler` should be stable (module fn or useCallback) or re-subscribing
// is fine — the effect re-binds when it changes.
export function useHashChange(handler: () => void): void {
  useEffect(() => {
    window.addEventListener("hashchange", handler);
    window.addEventListener("popstate", handler);
    return () => {
      window.removeEventListener("hashchange", handler);
      window.removeEventListener("popstate", handler);
    };
  }, [handler]);
}

export type DetailResolver = (slug: string | null) => Pokemon | null;

// The open detail sheet, synced with the hash. `resolve(slug)` returns the
// Pokémon that slug means here (or null — a slug left over from another
// view is dropped from the hash). Returns [pokemon | null, open, close].
export function useDetailHash(resolve: DetailResolver): [Pokemon | null, (pokemon: Pokemon) => void, () => void] {
  const [selected, setSelected] = useState<Pokemon | null>(() => resolve(readHash().detail));
  // Back/forward (or a hand-edited hash) opens or closes the sheet
  useHashChange(useCallback(() => setSelected(resolve(readHash().detail)), [resolve]));
  useEffect(() => {
    const { tab, rest, detail } = readHash();
    if (detail && !selected) writeHash(tab, rest, { detail: null });
  }, [selected]);
  const open = (pokemon: Pokemon): void => {
    setSelected(pokemon);
    const { tab, rest } = readHash();
    const depth = historyDepth() + 1;
    writeHash(tab, rest, { detail: pokemon.name, push: true, state: { detail: pokemon.name, depth } });
  };
  const close = (): void => {
    setSelected(null);
    // the entries we pushed on open — pop them; a sheet opened from a pasted
    // or refreshed link has none, so just drop the segment
    const depth = historyDepth();
    if (depth) window.history.go(-depth);
    else {
      const { tab, rest } = readHash();
      writeHash(tab, rest, { detail: null });
    }
  };
  return [selected, open, close];
}

// Small JSON blobs in localStorage (in-progress board, current card).
// Callers know what they stored; `loadJson` hands it back untyped.
export function loadJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

export function saveJson(key: string, value: unknown): void {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or unavailable — the app just won't remember this
  }
}
