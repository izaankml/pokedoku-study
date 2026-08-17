import { useEffect, useMemo, useState } from "react";
import CategorySelect from "./CategorySelect.jsx";
import AnswerList from "./AnswerList.jsx";
import { intersection, membersOf, normalizeName, pairIsValid } from "../logic/matching.js";
import { CATEGORY_BY_ID, getCategory } from "../data/categories.js";
import { POKEMON } from "../data/pokedex.js";
import { hashStateFor, writeHash } from "../logic/hashState.js";

// The picked categories live in the URL (#browse, #browse/type-fire,
// #browse/region-kanto/type-fire); both start blank, which lists everyone.
function initialPick() {
  const [a, b] = hashStateFor("browse") || [];
  const first = CATEGORY_BY_ID.has(a) ? a : "";
  const second = CATEGORY_BY_ID.has(b) && (!first || pairIsValid(first, b)) ? b : "";
  return { first, second };
}

// A Pokémon matches the search when the query is inside its name (the
// dataset's own name and the dex slug count too, like the answer boxes)
function matches(p, q) {
  return (
    normalizeName(p.displayName).includes(q) ||
    (p.altName && normalizeName(p.altName).includes(q)) ||
    (p.form && p.name.includes(q))
  );
}

function Browser() {
  const [{ first, second }, setPick] = useState(initialPick);
  const [query, setQuery] = useState("");
  const setSecond = (id) => setPick((p) => ({ ...p, second: id }));
  useEffect(() => {
    writeHash("browse", [first, second].filter(Boolean));
  }, [first, second]);

  // The other dropdown only offers categories that pair with this one;
  // changing one drops the other if they no longer work together.
  const changeFirst = (id) => {
    setPick((p) => ({ first: id, second: p.second && id && !pairIsValid(id, p.second) ? "" : p.second }));
  };

  const cats = [first, second].filter(Boolean);
  const pokemon = useMemo(
    () => (cats.length === 2 ? intersection(cats[0], cats[1]) : cats.length === 1 ? membersOf(cats[0]) : POKEMON),
    [first, second] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const q = normalizeName(query);
  const shown = q ? pokemon.filter((p) => matches(p, q)) : pokemon;
  const title = cats.length ? cats.map((c) => getCategory(c).label).join(" × ") : "All Pokémon";

  return (
    <div className="browser">
      <p className="hint">
        Pick a category — or two, like a PokeDoku cell — and study who fits.
      </p>
      <div className="browser-controls">
        <CategorySelect value={first} onChange={changeFirst} partner={second} label="First category" />
        <span className="times">×</span>
        <CategorySelect value={second} onChange={setSecond} partner={first} label="Second category" />
        <input
          type="search"
          className="browser-search"
          placeholder="Search these…"
          aria-label="Search the listed Pokémon"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
      </div>
      {shown.length ? (
        <AnswerList pokemon={shown} title={title} />
      ) : (
        <p className="hint">{q ? `Nothing here matches “${query.trim()}”.` : "No Pokémon matches both categories."}</p>
      )}
    </div>
  );
}

export default Browser;
