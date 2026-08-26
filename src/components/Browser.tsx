import { useCallback, useEffect, useMemo, useState } from "react";
import CategoryPicker from "./CategoryPicker.tsx";
import AnswerList from "./AnswerList.tsx";
import { canJoin, intersectAll, normalizeName } from "../logic/matching.ts";
import { CATEGORY_BY_ID, getCategory } from "../data/categories.ts";
import type { Pokemon } from "../data/types.ts";
import { hashStateFor, useHashChange, writeHash } from "../logic/hashState.ts";

// Up to three picked category ids, "" for an empty slot.
const SLOTS = 3;

// Keeps ids greedily in order (earlier wins), dropping unknowns and any
// that no longer combine — the one rule for which picks may coexist.
function keepValid(ids: string[]): string[] {
  const kept: string[] = [];
  for (const id of ids) {
    if (kept.length < SLOTS && id && CATEGORY_BY_ID.has(id) && canJoin(kept, id)) kept.push(id);
  }
  return kept;
}

// The picked categories live in the URL (#browse, #browse/type-fire,
// #browse/region-kanto/type-fire/flag-legendary); all slots start blank,
// which lists everyone. Ids are kept only while they still combine.
function picksFromHash(): string[] {
  const picks = keepValid(hashStateFor("browse") || []);
  while (picks.length < SLOTS) picks.push("");
  return picks;
}

// A Pokémon matches the search when the query is inside its name (the
// dataset's own name and the dex slug count too, like the answer boxes)
function matches(pokemon: Pokemon, normalizedQuery: string): boolean {
  return (
    normalizeName(pokemon.displayName).includes(normalizedQuery) ||
    (pokemon.altName !== undefined && normalizeName(pokemon.altName).includes(normalizedQuery)) ||
    (pokemon.form !== null && pokemon.name.includes(normalizedQuery))
  );
}

function Browser() {
  const [picks, setPicks] = useState<string[]>(picksFromHash);
  const [query, setQuery] = useState("");
  const chosen = picks.filter(Boolean);
  useEffect(() => {
    writeHash("browse", chosen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picks]);

  // A pill clicked elsewhere jumps here through the hash (jumpToBrowse
  // dispatches a synthetic hashchange); Back/forward land here too. An
  // event that didn't change the picks (a detail sheet closing pops
  // history) keeps the current array so the list memo survives.
  useHashChange(
    useCallback(() => {
      if (!hashStateFor("browse")) return;
      setPicks((current) => {
        const next = picksFromHash();
        return current.length === next.length && current.every((value, slot) => value === next[slot]) ? current : next;
      });
    }, []),
  );

  // Changing one slot drops any other pick that no longer combines. The
  // edited pick is validated first so it always survives; the rest keep
  // their slots (keepValid drops only genuine conflicts).
  const changeAt = (index: number) => (id: string) => {
    setPicks((current) => {
      const next = [...current];
      next[index] = id;
      const survivors = new Set(keepValid([id, ...next.filter((value, slot) => value && slot !== index)]));
      return next.map((value, slot) => (slot === index ? value : value && survivors.has(value) ? value : ""));
    });
  };

  const pokemon = useMemo(
    () => intersectAll(chosen),
    [picks], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const normalizedQuery = normalizeName(query);
  const shown = normalizedQuery ? pokemon.filter((entry) => matches(entry, normalizedQuery)) : pokemon;
  const title = chosen.length ? chosen.map((id) => getCategory(id).label).join(" × ") : "All Pokémon";
  // the third picker earns its place once the first two are set
  const showThird = Boolean((picks[0] && picks[1]) || picks[2]);

  return (
    <div className="browser">
      <p className="hint">
        Pick a category — or two or three, like a PokeDoku cell — and study
        who fits.
      </p>
      <div className="browser-controls">
        <CategoryPicker value={picks[0]} onChange={changeAt(0)} partners={[picks[1], picks[2]]} label="First category" />
        <span className="times">×</span>
        <CategoryPicker value={picks[1]} onChange={changeAt(1)} partners={[picks[0], picks[2]]} label="Second category" />
        {showThird ? (
          <>
            <span className="times">×</span>
            <CategoryPicker value={picks[2]} onChange={changeAt(2)} partners={[picks[0], picks[1]]} label="Third category" />
          </>
        ) : null}
        <input
          type="search"
          className="browser-search"
          placeholder="Search these…"
          aria-label="Search the listed Pokémon"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
      </div>
      {shown.length ? (
        <AnswerList pokemon={shown} title={title} />
      ) : (
        <p className="hint">
          {normalizedQuery ? `Nothing here matches “${query.trim()}”.` : "No Pokémon matches these categories."}
        </p>
      )}
    </div>
  );
}

export default Browser;
