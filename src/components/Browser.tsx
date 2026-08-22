import { useEffect, useMemo, useState } from "react";
import CategoryPicker from "./CategoryPicker.tsx";
import AnswerList from "./AnswerList.tsx";
import { intersection, membersOf, normalizeName, pairIsValid } from "../logic/matching.ts";
import { CATEGORY_BY_ID, getCategory } from "../data/categories.ts";
import { POKEMON } from "../data/pokedex.ts";
import type { Pokemon } from "../data/types.ts";
import { hashStateFor, writeHash } from "../logic/hashState.ts";

// The two dropdowns' category ids, "" for none.
interface Pick {
  first: string;
  second: string;
}

// The picked categories live in the URL (#browse, #browse/type-fire,
// #browse/region-kanto/type-fire); both start blank, which lists everyone.
function initialPick(): Pick {
  const [a = "", b = ""] = hashStateFor("browse") || [];
  const first = CATEGORY_BY_ID.has(a) ? a : "";
  const second = CATEGORY_BY_ID.has(b) && (!first || pairIsValid(first, b)) ? b : "";
  return { first, second };
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
  const [{ first, second }, setPick] = useState<Pick>(initialPick);
  const [query, setQuery] = useState("");
  const setSecond = (id: string) => setPick((pick) => ({ ...pick, second: id }));
  useEffect(() => {
    writeHash("browse", [first, second].filter(Boolean));
  }, [first, second]);

  // The other picker only offers categories that pair with this one;
  // changing one drops the other if they no longer work together.
  const changeFirst = (id: string) => {
    setPick((pick) => ({
      first: id,
      second: pick.second && id && !pairIsValid(id, pick.second) ? "" : pick.second,
    }));
  };

  const cats = [first, second].filter(Boolean);
  const pokemon = useMemo(
    () => (cats.length === 2 ? intersection(cats[0], cats[1]) : cats.length === 1 ? membersOf(cats[0]) : POKEMON),
    [first, second], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const normalizedQuery = normalizeName(query);
  const shown = normalizedQuery ? pokemon.filter((entry) => matches(entry, normalizedQuery)) : pokemon;
  const title = cats.length ? cats.map((id) => getCategory(id).label).join(" × ") : "All Pokémon";

  return (
    <div className="browser">
      <p className="hint">
        Pick a category — or two, like a PokeDoku cell — and study who fits.
      </p>
      <div className="browser-controls">
        <CategoryPicker value={first} onChange={changeFirst} partner={second} label="First category" />
        <span className="times">×</span>
        <CategoryPicker value={second} onChange={setSecond} partner={first} label="Second category" />
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
          {normalizedQuery ? `Nothing here matches “${query.trim()}”.` : "No Pokémon matches both categories."}
        </p>
      )}
    </div>
  );
}

export default Browser;
