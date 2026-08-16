import { useState } from "react";
import PokemonCard from "./PokemonCard.jsx";
import PokemonDetail from "./PokemonDetail.jsx";

function AnswerList({ pokemon, title, highlightId }) {
  const [selected, setSelected] = useState(null);
  return (
    <section className="answer-list">
      {title ? (
        <h3>
          {title} <span className="count">({pokemon.length})</span>
        </h3>
      ) : null}
      <div className="answer-grid">
        {pokemon.map((p) => (
          <div key={p.id} className={p.id === highlightId ? "highlight" : ""}>
            <PokemonCard pokemon={p} onClick={() => setSelected(p)} />
          </div>
        ))}
      </div>
      {selected ? <PokemonDetail pokemon={selected} onClose={() => setSelected(null)} /> : null}
    </section>
  );
}

export default AnswerList;
