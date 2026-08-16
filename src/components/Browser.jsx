import { useState } from "react";
import CategorySelect from "./CategorySelect.jsx";
import AnswerList from "./AnswerList.jsx";
import { intersection, membersOf } from "../logic/matching.js";
import { getCategory } from "../data/categories.js";

function Browser() {
  const [first, setFirst] = useState("region-unova");
  const [second, setSecond] = useState("");

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
        <CategorySelect value={first} onChange={setFirst} />
        <span className="times">×</span>
        <CategorySelect value={second} onChange={setSecond} allowNone />
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
