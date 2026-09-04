import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useStats } from "../StatsContext.ts";
import { pickDrillPair } from "../logic/picker.ts";
import { guessFilterFor, intersection, pairIsValid, pairKey } from "../logic/matching.ts";
import type { CategoryPair } from "../logic/matching.ts";
import {
  NAME_ALL_KINDS,
  loadNameAllKinds,
  nameAllKey,
  nameAllSpecies,
  nameAllTargetFrom,
  pickNameAllTarget,
  saveNameAllKinds,
} from "../logic/nameAll.ts";
import type { NameAllKind, NameAllTarget } from "../logic/nameAll.ts";
import { CATEGORY_BY_ID, whyNot } from "../data/categories.ts";
import type { Pokemon } from "../data/types.ts";
import { hashStateFor, loadJson, saveJson, writeHash } from "../logic/hashState.ts";
import { formatInterval, intervalFor } from "../logic/schedule.ts";
import CategoryPill from "./CategoryPill.tsx";
import PokemonAutocomplete from "./PokemonAutocomplete.tsx";
import AnswerList from "./AnswerList.tsx";
import ToggleGroup from "./ToggleGroup.tsx";

// Name one: any Pokémon that fits a pair. Name all: every Pokémon that
// fits, for a pair (or a Group) small enough to finish.
type DrillMode = "one" | "all";
const MODE_KEY = "pokedoku-study:drill-mode:v1";

// The URL names the question: #drill/type-fire/flag-legendary asks for
// one; #drill/all/type-fire/type-flying asks for all of them.
function pairFromHash(): CategoryPair | null {
  const [a = "", b = ""] = hashStateFor("drill") || [];
  const catA = CATEGORY_BY_ID.get(a);
  const catB = CATEGORY_BY_ID.get(b);
  if (catA && catB && a !== b && pairIsValid(a, b)) return [catA, catB];
  return null;
}

function targetFromHash(): NameAllTarget | null {
  const [first, ...ids] = hashStateFor("drill") || [];
  return first === "all" ? nameAllTargetFrom(ids) : null;
}

// the URL's mode when it names a question, else the remembered one
function initialMode(): DrillMode {
  const hash = hashStateFor("drill");
  if (hash?.[0] === "all") return "all";
  if (hash?.length) return "one";
  return loadJson(MODE_KEY) === "all" ? "all" : "one";
}

// How the question went: the guess (null when given up) and whether it fit.
interface DrillResult {
  pokemon: Pokemon | null;
  correct: boolean;
}

function NameOne() {
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
    <>
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
          {result.correct ? (
            <p className="due-note">
              {/* PokeDoku's own pick rates need a login; the pool size is
                  the local stand-in for how findable the answer was */}
              {answers.length === 1 ? "The only valid answer!" : `One of ${answers.length} valid answers.`}
            </p>
          ) : null}
          {nextIn ? <p className="due-note">This pair comes back in {nextIn}.</p> : null}
          <button className="primary" onClick={next}>
            Next Question
          </button>
          <AnswerList
            pokemon={answers}
            title="Valid Answers"
            highlightId={result.pokemon?.id}
            guess={result.correct ? null : result.pokemon}
          />
        </>
      )}
    </>
  );
}

// The last guess's outcome, shown under the input
interface GuessNote {
  text: ReactNode;
  tone: "correct" | "wrong" | "revealed";
  // bumps so the note re-animates on every guess
  seq: number;
}

function NameAll() {
  const { merged, recordAttempt } = useStats();
  const [kinds, setKinds] = useState<NameAllKind[]>(loadNameAllKinds);
  const [target, setTarget] = useState<NameAllTarget>(() => targetFromHash() || pickNameAllTarget(merged, kinds));
  useEffect(() => {
    writeHash("drill", ["all", ...target.map((category) => category.id)]);
  }, [target]);
  const species = useMemo(() => nameAllSpecies(target), [target]);
  // species ids, in the order they were named
  const [found, setFound] = useState<number[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [note, setNote] = useState<GuessNote | null>(null);

  const ids = target.map((category) => category.id);
  const pair = target.length === 2 ? pairKey(target[0].id, target[1].id) : undefined;
  const done = revealed || found.length === species.length;
  const foundPokemon = found.flatMap((speciesId) => species.filter((pokemon) => pokemon.species === speciesId));
  const missed = species.filter((pokemon) => !found.includes(pokemon.species));

  // A guess counts for its species: "Charizard" finds Charizard whether
  // the base form or a Mega is the one that fits
  function guess(pokemon: Pokemon) {
    if (done) return;
    const hit = species.find((candidate) => candidate.species === pokemon.species);
    const seq = (note?.seq ?? 0) + 1;
    if (hit && found.includes(hit.species)) {
      setNote({ text: `${hit.displayName} — already found.`, tone: "revealed", seq });
      return;
    }
    recordAttempt({ categories: ids, pair, correct: Boolean(hit) });
    if (hit) {
      setFound((current) => [...current, hit.species]);
      setNote({ text: `✓ ${hit.displayName}`, tone: "correct", seq });
    } else {
      setNote({ text: `${pokemon.displayName} doesn't fit — it ${whyNot(pokemon, ids)}.`, tone: "wrong", seq });
    }
  }

  function reveal() {
    if (done) return;
    recordAttempt({ categories: ids, pair, correct: false });
    setRevealed(true);
    setNote(null);
  }

  function next(nextKinds: NameAllKind[] = kinds) {
    setTarget(pickNameAllTarget(merged, nextKinds, { avoid: nameAllKey(target) }));
    setFound([]);
    setRevealed(false);
    setNote(null);
  }

  // the last shape can't be turned off — there'd be nothing to draw
  function toggleKind(kind: string) {
    if (!NAME_ALL_KINDS.some(([each]) => each === kind)) return;
    const next = kinds.includes(kind as NameAllKind)
      ? kinds.filter((each) => each !== kind)
      : [...kinds, kind as NameAllKind];
    if (!next.length) return;
    setKinds(next);
    saveNameAllKinds(next);
  }

  return (
    <>
      <p className="hint">
        Name every Pokémon that fits — {species.length} to find. Forms count for their species.
      </p>
      <div className="question">
        {target.map((category, index) => (
          <span key={category.id} className="question-part">
            {index > 0 ? <span className="times">×</span> : null}
            <CategoryPill cat={category} />
          </span>
        ))}
      </div>
      <p className="name-all-progress" aria-live="polite">
        {found.length} of {species.length} found
        <span className="name-all-bar" aria-hidden="true">
          <span style={{ width: `${species.length ? (100 * found.length) / species.length : 0}%` }} />
        </span>
      </p>
      {done ? (
        <p key="done" className={`verdict ${revealed ? "revealed" : "correct"}`}>
          {revealed ? `Revealed — ${found.length} of ${species.length} named.` : `All ${species.length} found!`}
        </p>
      ) : (
        <>
          <PokemonAutocomplete onSubmit={guess} eligible={guessFilterFor(ids)} placeholder="Name one that fits…" />
          {note ? (
            <p key={note.seq} className={`verdict ${note.tone}`} aria-live="polite">
              {note.text}
            </p>
          ) : null}
        </>
      )}
      <div className="action-row">
        {done ? (
          <button className="primary" onClick={() => next()}>
            Next Question
          </button>
        ) : (
          <>
            <button className="ghost" onClick={reveal}>
              Reveal the rest
            </button>
            <button className="ghost" onClick={() => next()}>
              Skip ›
            </button>
          </>
        )}
      </div>
      {/* the tiles open detail sheets only once the round is over: a
          sheet's evolution line would name the ones still to find */}
      {foundPokemon.length ? <AnswerList pokemon={foundPokemon} title="Found" tappable={done} /> : null}
      {done && missed.length ? <AnswerList pokemon={missed} title="Missed" /> : null}
      <details className="drill-kinds">
        <summary>
          Draw from · {kinds.length} of {NAME_ALL_KINDS.length} shapes
        </summary>
        <ToggleGroup
          title="Question shapes"
          toggles={NAME_ALL_KINDS.map(([kind, label]) => ({ id: kind, label, included: kinds.includes(kind) }))}
          onToggle={toggleKind}
          hint="Rounds are kept to 40 Pokémon or fewer. The next question draws from these."
        />
      </details>
    </>
  );
}

function Drill() {
  const [mode, setMode] = useState<DrillMode>(initialMode);

  function switchMode(next: DrillMode) {
    if (next === mode) return;
    saveJson(MODE_KEY, next);
    setMode(next);
  }

  return (
    <div className="drill">
      <div className="mode-switch" role="group" aria-label="Drill mode">
        <button className="mode-btn" aria-pressed={mode === "one"} onClick={() => switchMode("one")}>
          Name one
        </button>
        <button className="mode-btn" aria-pressed={mode === "all"} onClick={() => switchMode("all")}>
          Name all
        </button>
      </div>
      {mode === "all" ? <NameAll /> : <NameOne />}
    </div>
  );
}

export default Drill;
