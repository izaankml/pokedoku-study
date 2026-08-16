import { useRef, useState } from "react";
import { useStats } from "../StatsContext.js";
import { pickFlashcardPokemon } from "../logic/picker.js";
import { formatInterval, intervalFor } from "../logic/schedule.js";
import { CATEGORIES } from "../data/categories.js";
import PokemonCard from "./PokemonCard.jsx";

const REGION_CATS = CATEGORIES.filter((c) => c.group === "region");

function Flashcards() {
  const { merged, recordAttempt } = useStats();
  const recent = useRef([]);
  const [pokemon, setPokemon] = useState(() => pickFlashcardPokemon(merged));
  const [picked, setPicked] = useState(null); // region id the user chose

  // A few forms count for two regions (White-Striped Basculin: Unova and
  // Hisui); either answer is right.
  const answerCats = REGION_CATS.filter((c) => pokemon.regions.includes(c.id.slice(7)));
  const answerIds = new Set(answerCats.map((c) => c.id));
  // After answering, merged already reflects this attempt's new streak.
  const entry = merged.flashcards[String(pokemon.id)];
  const nextIn = picked && entry ? formatInterval(intervalFor(entry.s)) : null;

  function choose(cat) {
    if (picked) return;
    const correct = answerIds.has(cat.id);
    recordAttempt({ categories: [...answerIds], speciesId: pokemon.id, correct });
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
        caption={
          picked
            ? `Gen ${pokemon.gen} — ${answerCats.map((c) => c.short).join(" / ")}${nextIn ? ` · next in ${nextIn}` : ""}`
            : null
        }
      />
      <div className={picked ? "region-buttons answered" : "region-buttons"}>
        {REGION_CATS.map((cat) => {
          let cls = "region-btn";
          if (picked) {
            if (answerIds.has(cat.id)) cls += " correct";
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
