import PokemonCard from "./PokemonCard.jsx";
import PokemonDetail from "./PokemonDetail.jsx";
import { useDetailHash } from "../logic/hashState.js";
import { POKEMON_BY_NAME } from "../data/pokedex.js";

// the open sheet lives in the URL (…/pokemon-eevee); any Pokémon, since a
// sheet's evolution tiles lead to sheets of Pokémon outside this list
const resolve = (slug) => (slug && POKEMON_BY_NAME.get(slug)) || null;

function AnswerList({ pokemon, title, highlightId }) {
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
      {selected ? <PokemonDetail pokemon={selected} onClose={close} onOpen={open} /> : null}
    </section>
  );
}

export default AnswerList;
