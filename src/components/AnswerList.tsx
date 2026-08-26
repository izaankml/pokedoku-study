import PokemonCard from "./PokemonCard.tsx";
import PokemonDetail from "./PokemonDetail.tsx";
import { useDetailHash } from "../logic/hashState.ts";
import { pokemonBySlug } from "../data/pokedex.ts";
import { usePagedList } from "./usePagedList.ts";
import type { Pokemon } from "../data/types.ts";

// Long lists (Browse with nothing picked is every Pokémon) render in
// batches: PAGE cards at once, PAGE more each time the end scrolls near.
const PAGE = 60;

interface AnswerListProps {
  pokemon: Pokemon[];
  title?: string;
  // the Pokémon to mark out (the one just guessed)
  highlightId?: number;
  // a wrong guess, shown above the list as its own tile — tapping it
  // opens the detail sheet, where "why doesn't it fit" lives
  guess?: Pokemon | null;
}

function AnswerList({ pokemon, title, highlightId, guess = null }: AnswerListProps) {
  // the open sheet lives in the URL (…/pokemon-eevee); any Pokémon, since
  // a sheet's evolution tiles lead to sheets of Pokémon outside this list
  const [selected, open, close] = useDetailHash(pokemonBySlug);
  const { shown, done, sentinelRef } = usePagedList(pokemon, PAGE);
  return (
    <section className="answer-list">
      {guess ? (
        <>
          <h3>Your Guess</h3>
          <div className="answer-grid">
            <div className="wrong-guess">
              <PokemonCard pokemon={guess} onClick={() => open(guess)} />
            </div>
          </div>
        </>
      ) : null}
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
      {!done ? <div ref={sentinelRef} className="answer-more" aria-hidden="true" /> : null}
      {selected ? <PokemonDetail pokemon={selected} onClose={close} onOpen={open} /> : null}
    </section>
  );
}

export default AnswerList;
