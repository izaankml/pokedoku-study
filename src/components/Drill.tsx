import { useEffect, useState } from "react";
import { useStats } from "../StatsContext.ts";
import { pickDrillPair } from "../logic/picker.ts";
import { guessFilterFor, intersection, pairIsValid, pairKey } from "../logic/matching.ts";
import type { CategoryPair } from "../logic/matching.ts";
import { CATEGORY_BY_ID, whyNot } from "../data/categories.ts";
import type { Pokemon } from "../data/types.ts";
import { hashStateFor, writeHash } from "../logic/hashState.ts";
import { formatInterval, intervalFor } from "../logic/schedule.ts";
import CategoryPill from "./CategoryPill.tsx";
import PokemonAutocomplete from "./PokemonAutocomplete.tsx";
import AnswerList from "./AnswerList.tsx";

// The current question lives in the URL (#drill/type-fire/flag-legendary),
// so a reload asks the same one.
function pairFromHash(): CategoryPair | null {
  const [a = "", b = ""] = hashStateFor("drill") || [];
  const catA = CATEGORY_BY_ID.get(a);
  const catB = CATEGORY_BY_ID.get(b);
  if (catA && catB && a !== b && pairIsValid(a, b)) return [catA, catB];
  return null;
}

// How the question went: the guess (null when given up) and whether it fit.
interface DrillResult {
  pokemon: Pokemon | null;
  correct: boolean;
}

function Drill() {
  const { merged, recordAttempt } = useStats();
  const [pair, setPair] = useState<CategoryPair>(() => pairFromHash() || pickDrillPair(merged));
  useEffect(() => {
    writeHash("drill", [pair[0].id, pair[1].id]);
  }, [pair]);
  const [result, setResult] = useState<DrillResult | null>(null);
  const [streak, setStreak] = useState(0);

  const [a, b] = pair;
  const answers = intersection(a.id, b.id);
  // After answering, merged already reflects this attempt's new streak.
  const pairEntry = merged.pairs[pairKey(a.id, b.id)];
  const nextIn = result && pairEntry ? formatInterval(intervalFor(pairEntry.s)) : null;

  function grade(pokemon: Pokemon) {
    const correct = answers.some((answer) => answer.id === pokemon.id);
    recordAttempt({
      categories: [a.id, b.id],
      pair: pairKey(a.id, b.id),
      correct,
    });
    setResult({ pokemon, correct });
    setStreak((current) => (correct ? current + 1 : 0));
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
          <PokemonAutocomplete onSubmit={grade} eligible={guessFilterFor([a.id, b.id])} />
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
            {result.pokemon
              ? result.correct
                ? `Correct — ${result.pokemon.displayName}!`
                : `${result.pokemon.displayName} doesn't fit — it ${whyNot(result.pokemon, [a.id, b.id])}.`
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
