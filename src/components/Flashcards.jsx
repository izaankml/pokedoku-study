import { useRef, useState } from "react";
import { useStats } from "../StatsContext.js";
import { pickFlashcardPokemon } from "../logic/picker.js";
import { CATEGORIES } from "../data/categories.js";
import PokemonCard from "./PokemonCard.jsx";

const REGION_CATS = CATEGORIES.filter((c) => c.group === "region");

function Flashcards() {
  const { merged, recordAttempt } = useStats();
  const recent = useRef([]);
  const [pokemon, setPokemon] = useState(() => pickFlashcardPokemon(merged));
  const [picked, setPicked] = useState(null); // region id the user chose

  const answerCat = REGION_CATS.find((c) => c.id === `region-${pokemon.region}`);

  function choose(cat) {
    if (picked) return;
    const correct = cat.id === answerCat.id;
    recordAttempt({ categories: [answerCat.id], speciesId: pokemon.id, correct });
    setPicked(cat.id);
  }

  function next() {
    recent.current = [...recent.current, pokemon.id].slice(-10);
    setPicked(null);
    setPokemon(
      pickFlashcardPokemon(merged, { exclude: new Set(recent.current) })
    );
  }

  return (
    <div className="flashcards">
      <p className="hint">Which region is this Pokémon originally from?</p>
      <PokemonCard
        pokemon={pokemon}
        caption={picked ? `Gen ${pokemon.gen} — ${answerCat.short}` : null}
      />
      <div className={picked ? "region-buttons answered" : "region-buttons"}>
        {REGION_CATS.map((cat) => {
          let cls = "region-btn";
          if (picked) {
            if (cat.id === answerCat.id) cls += " correct";
            else if (cat.id === picked) cls += " wrong";
          }
          return (
            <button key={cat.id} className={cls} onClick={() => choose(cat)}>
              {cat.short}
            </button>
          );
        })}
      </div>
      <div className="card-actions">
        {picked ? (
          <button className="primary" onClick={next}>
            Next Pokémon
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default Flashcards;
