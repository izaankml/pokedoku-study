import { useState } from "react";
import { useStats } from "../StatsContext.js";
import { pickDrillPair } from "../logic/picker.js";
import { intersection, pairKey } from "../logic/matching.js";
import { formatInterval, intervalFor } from "../logic/schedule.js";
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
  // After answering, merged already reflects this attempt's new streak.
  const pairEntry = merged.pairs[pairKey(a.id, b.id)];
  const nextIn = result && pairEntry ? formatInterval(intervalFor(pairEntry.s)) : null;

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
          <div className="action-row">
            <button className="ghost" onClick={giveUp}>
              Don&apos;t Know
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
          <p
            className={`verdict ${result.correct ? "correct" : result.pokemon ? "wrong" : "revealed"}`}
          >
            {result.correct
              ? `Correct — ${result.pokemon.displayName}!`
              : result.pokemon
                ? `${result.pokemon.displayName} doesn't fit.`
                : "Revealed."}
          </p>
          {nextIn ? <p className="due-note">This pair comes back in {nextIn}.</p> : null}
          <button className="primary" onClick={next}>
            Next Question
          </button>
          <AnswerList
            pokemon={answers}
            title="Valid Answers"
            highlightId={result.pokemon?.id}
          />
        </>
      )}
    </div>
  );
}

export default Drill;
