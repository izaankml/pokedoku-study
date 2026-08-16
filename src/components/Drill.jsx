import { useState } from "react";
import { useStats } from "../StatsContext.js";
import { pickDrillPair } from "../logic/picker.js";
import { intersection, pairKey } from "../logic/matching.js";
import CategoryPill from "./CategoryPill.jsx";
import PokemonAutocomplete from "./PokemonAutocomplete.jsx";
import AnswerList from "./AnswerList.jsx";

function Drill() {
  const { merged, recordAttempt } = useStats();
  const [pair, setPair] = useState(() => pickDrillPair(merged));
  const [result, setResult] = useState(null); // {pokemon|null, correct}
  const [streak, setStreak] = useState(0);

  const [a, b] = pair;
  const answers = intersection(a.id, b.id);

  function grade(pokemon) {
    const correct = answers.some((p) => p.id === pokemon.id);
    recordAttempt({
      categories: [a.id, b.id],
      pair: pairKey(a.id, b.id),
      correct,
    });
    setResult({ pokemon, correct });
    setStreak((s) => (correct ? s + 1 : 0));
  }

  function giveUp() {
    recordAttempt({
      categories: [a.id, b.id],
      pair: pairKey(a.id, b.id),
      correct: false,
    });
    setResult({ pokemon: null, correct: false });
    setStreak(0);
  }

  function next() {
    setResult(null);
    setPair(pickDrillPair(merged, { avoid: new Set([pairKey(a.id, b.id)]) }));
  }

  return (
    <div className="drill">
      <p className="hint">Name any Pokémon that fits both categories.</p>
      <div className="question">
        <CategoryPill cat={a} />
        <span className="times">×</span>
        <CategoryPill cat={b} />
      </div>
      {result === null ? (
        <>
          <PokemonAutocomplete onSubmit={grade} />
          <div className="drill-actions">
            <button className="ghost" onClick={giveUp}>
              Give up
            </button>
            {streak > 1 ? (
              <span key={streak} className={streak >= 5 ? "streak hot" : "streak"}>
                streak {streak}
              </span>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <p className={result.correct ? "verdict correct" : "verdict wrong"}>
            {result.correct
              ? `Correct — ${result.pokemon.displayName}!`
              : result.pokemon
                ? `${result.pokemon.displayName} doesn't fit.`
                : "Revealed."}
          </p>
          <button className="primary" onClick={next}>
            Next question
          </button>
          <AnswerList
            pokemon={answers}
            title="Valid answers"
            highlightId={result.pokemon?.id}
          />
        </>
      )}
    </div>
  );
}

export default Drill;
