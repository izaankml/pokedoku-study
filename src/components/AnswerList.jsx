import { useCallback } from "react";
import PokemonCard from "./PokemonCard.jsx";
import PokemonDetail from "./PokemonDetail.jsx";
import { useDetailHash } from "../logic/hashState.js";

function AnswerList({ pokemon, title, highlightId }) {
  // the open sheet lives in the URL (…/pokemon-eevee) — only for a Pokémon
  // in this list, so a slug left over from another view doesn't open here
  const resolve = useCallback((slug) => (slug && pokemon.find((p) => p.name === slug)) || null, [pokemon]);
  const [selected, open, close] = useDetailHash(resolve);
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
            <PokemonCard pokemon={p} onClick={() => open(p)} />
          </div>
        ))}
      </div>
      {selected ? <PokemonDetail pokemon={selected} onClose={close} /> : null}
    </section>
  );
}

export default AnswerList;
