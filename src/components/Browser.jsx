import { useEffect, useState } from "react";
import CategorySelect from "./CategorySelect.jsx";
import AnswerList from "./AnswerList.jsx";
import { intersection, membersOf, pairIsValid } from "../logic/matching.js";
import { CATEGORY_BY_ID, getCategory } from "../data/categories.js";
import { hashStateFor, writeHash } from "../logic/hashState.js";

// The picked categories live in the URL (#browse/region-kanto/type-fire).
function initialPick() {
  const [a, b] = hashStateFor("browse") || [];
  const first = CATEGORY_BY_ID.has(a) ? a : "region-kanto";
  const second = CATEGORY_BY_ID.has(b) && pairIsValid(first, b) ? b : "";
  return { first, second };
}

function Browser() {
  const [{ first, second }, setPick] = useState(initialPick);
  const setSecond = (id) => setPick((p) => ({ ...p, second: id }));
  useEffect(() => {
    writeHash("browse", second ? [first, second] : [first]);
  }, [first, second]);

  // The second dropdown only offers categories that pair with the first;
  // changing the first drops a second that no longer works with it.
  const changeFirst = (id) => {
    setPick((p) => ({ first: id, second: p.second && pairIsValid(id, p.second) ? p.second : "" }));
  };

  const pokemon = second ? intersection(first, second) : membersOf(first);
  const title = second
    ? `${getCategory(first).label} × ${getCategory(second).label}`
    : getCategory(first).label;

  return (
    <div className="browser">
      <p className="hint">
        Pick a category — or two, like a PokeDoku cell — and study who fits.
      </p>
      <div className="browser-controls">
        <CategorySelect value={first} onChange={changeFirst} partner={second} />
        <span className="times">×</span>
        <CategorySelect value={second} onChange={setSecond} partner={first} allowNone />
      </div>
      {pokemon.length ? (
        <AnswerList pokemon={pokemon} title={title} />
      ) : (
        <p className="hint">No Pokémon matches both categories.</p>
      )}
    </div>
  );
}

export default Browser;
