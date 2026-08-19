import { useEffect, useRef, useState } from "react";
import PokemonCard from "./PokemonCard.tsx";
import PokemonDetail from "./PokemonDetail.tsx";
import { useDetailHash } from "../logic/hashState.ts";
import { POKEMON_BY_NAME } from "../data/pokedex.ts";
import type { Pokemon } from "../data/types.ts";

// the open sheet lives in the URL (…/pokemon-eevee); any Pokémon, since a
// sheet's evolution tiles lead to sheets of Pokémon outside this list
const resolve = (slug: string | null): Pokemon | null => (slug && POKEMON_BY_NAME.get(slug)) || null;

// Long lists (Browse with nothing picked is every Pokémon) render in
// batches: PAGE cards at once, PAGE more each time the end scrolls near.
const PAGE = 60;

interface AnswerListProps {
  pokemon: Pokemon[];
  title?: string;
  // the Pokémon to mark out (the one just guessed)
  highlightId?: number;
}

function AnswerList({ pokemon, title, highlightId }: AnswerListProps) {
  const [selected, open, close] = useDetailHash(resolve);
  const [limit, setLimit] = useState(PAGE);
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => setLimit(PAGE), [pokemon]); // a new list starts over
  useEffect(() => {
    const end = endRef.current;
    if (!end || limit >= pokemon.length) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setLimit((current) => Math.min(current + PAGE, pokemon.length));
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(end);
    return () => observer.disconnect();
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
        {shown.map((entry) => (
          <div key={entry.id} className={entry.id === highlightId ? "highlight" : ""}>
            <PokemonCard pokemon={entry} onClick={() => open(entry)} />
          </div>
        ))}
      </div>
      {shown.length < pokemon.length ? <div ref={endRef} className="answer-more" aria-hidden="true" /> : null}
      {selected ? <PokemonDetail pokemon={selected} onClose={close} onOpen={open} /> : null}
    </section>
  );
}

export default AnswerList;
