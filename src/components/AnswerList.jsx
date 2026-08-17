import { useEffect, useRef, useState } from "react";
import PokemonCard from "./PokemonCard.jsx";
import PokemonDetail from "./PokemonDetail.jsx";
import { useDetailHash } from "../logic/hashState.js";
import { POKEMON_BY_NAME } from "../data/pokedex.js";

// the open sheet lives in the URL (…/pokemon-eevee); any Pokémon, since a
// sheet's evolution tiles lead to sheets of Pokémon outside this list
const resolve = (slug) => (slug && POKEMON_BY_NAME.get(slug)) || null;

// Long lists (Browse with nothing picked is every Pokémon) render in
// batches: PAGE cards at once, PAGE more each time the end scrolls near.
const PAGE = 60;

function AnswerList({ pokemon, title, highlightId }) {
  const [selected, open, close] = useDetailHash(resolve);
  const [limit, setLimit] = useState(PAGE);
  const endRef = useRef(null);
  useEffect(() => setLimit(PAGE), [pokemon]); // a new list starts over
  useEffect(() => {
    const end = endRef.current;
    if (!end || limit >= pokemon.length) return undefined;
    const io = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && setLimit((n) => Math.min(n + PAGE, pokemon.length)),
      { root: document.getElementById("root"), rootMargin: "600px 0px" }
    );
    io.observe(end);
    return () => io.disconnect();
  }, [limit, pokemon]);
  const shown = pokemon.length > limit ? pokemon.slice(0, limit) : pokemon;
  return (
    <section className="answer-list">
      {title ? (
        <h3>
          {title} <span className="count">({pokemon.length})</span>
        </h3>
      ) : null}
      <div className="answer-grid">
        {shown.map((p) => (
          <div key={p.id} className={p.id === highlightId ? "highlight" : ""}>
            <PokemonCard pokemon={p} onClick={() => open(p)} />
          </div>
        ))}
      </div>
      {shown.length < pokemon.length ? <div ref={endRef} className="answer-more" aria-hidden="true" /> : null}
      {selected ? <PokemonDetail pokemon={selected} onClose={close} onOpen={open} /> : null}
    </section>
  );
}

export default AnswerList;
