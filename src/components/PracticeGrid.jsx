import { useEffect, useMemo, useRef, useState } from "react";
import { useStats } from "../StatsContext.js";
import { generateGrid } from "../logic/grid.js";
import { intersection, pairKey } from "../logic/matching.js";
import { getCategory } from "../data/categories.js";
import CategoryPill from "./CategoryPill.jsx";
import Sprite from "./Sprite.jsx";
import PokemonAutocomplete from "./PokemonAutocomplete.jsx";
import AnswerList from "./AnswerList.jsx";

const emptyCells = () =>
  Array.from({ length: 9 }, () => ({ status: "empty", pokemon: null }));

function PracticeGrid() {
  const { merged, recordAttempt } = useStats();
  const [grid, setGrid] = useState(() => generateGrid(merged));
  const [cells, setCells] = useState(emptyCells);
  const [selected, setSelected] = useState(null);
  // On phones the answer panel sits below the board; bring it into view
  const panelRef = useRef(null);
  useEffect(() => {
    if (selected !== null) panelRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [selected]);
  const [guesses, setGuesses] = useState(0);
  const [message, setMessage] = useState("");

  const usedIds = useMemo(
    () => new Set(cells.filter((c) => c.pokemon).map((c) => c.pokemon.id)),
    [cells]
  );
  const done = cells.every((c) => c.status !== "empty");
  const filled = cells.filter((c) => c.status === "filled").length;

  const cellCats = (i) => [grid.rows[Math.floor(i / 3)], grid.cols[i % 3]];

  function guess(pokemon) {
    if (selected === null) return;
    const [rowId, colId] = cellCats(selected);
    if (usedIds.has(pokemon.id)) {
      setMessage(`${pokemon.displayName} is already on the board.`);
      return;
    }
    const answers = intersection(rowId, colId);
    const correct = answers.some((p) => p.id === pokemon.id);
    recordAttempt({
      categories: [rowId, colId],
      pair: pairKey(rowId, colId),
      correct,
    });
    setGuesses((g) => g + 1);
    if (correct) {
      setCells((cs) =>
        cs.map((c, i) => (i === selected ? { status: "filled", pokemon } : c))
      );
      setMessage(`${pokemon.displayName} fits!`);
      setSelected(null);
    } else {
      setMessage(`${pokemon.displayName} doesn't fit that cell.`);
    }
  }

  function revealCell() {
    if (selected === null) return;
    const [rowId, colId] = cellCats(selected);
    recordAttempt({
      categories: [rowId, colId],
      pair: pairKey(rowId, colId),
      correct: false,
    });
    setCells((cs) =>
      cs.map((c, i) => (i === selected ? { status: "revealed", pokemon: null } : c))
    );
    setMessage("");
  }

  function newGame() {
    setGrid(generateGrid(merged));
    setCells(emptyCells());
    setSelected(null);
    setGuesses(0);
    setMessage("");
  }

  return (
    <div className="practice">
      <p className="hint">
        Fill all nine cells — each Pokémon must fit its row and column, no
        repeats.
      </p>
      <div className="board">
        <div className="corner" />
        {grid.cols.map((c) => (
          <div key={c} className="header">
            <CategoryPill cat={getCategory(c)} useShort />
          </div>
        ))}
        {grid.rows.map((r, ri) => [
          <div key={r} className="header">
            <CategoryPill cat={getCategory(r)} useShort />
          </div>,
          ...grid.cols.map((c, ci) => {
            const i = ri * 3 + ci;
            const cell = cells[i];
            let cls = "cell";
            if (i === selected) cls += " selected";
            if (cell.status === "filled") cls += " filled";
            if (cell.status === "revealed") cls += " revealed";
            return (
              <button
                key={c}
                className={cls}
                onClick={() => {
                  setSelected(i);
                  setMessage("");
                }}
              >
                {cell.pokemon ? (
                  <Sprite pokemon={cell.pokemon} />
                ) : cell.status === "revealed" ? (
                  "✕"
                ) : (
                  ""
                )}
              </button>
            );
          }),
        ])}
      </div>
      <div className="board-toolbar">
        <p className="score">
          {filled}/9 filled · {guesses} guesses
          {done ? " — done!" : ""}
        </p>
        <button className="ghost" onClick={newGame}>
          New Grid
        </button>
      </div>
      <p key={message} className="grid-message">
        {message || " "}
      </p>
      {selected !== null && cells[selected].status === "empty" ? (
        <div className="cell-panel" ref={panelRef}>
          <div className="question">
            <CategoryPill cat={getCategory(cellCats(selected)[0])} />
            <span className="times">×</span>
            <CategoryPill cat={getCategory(cellCats(selected)[1])} />
          </div>
          <PokemonAutocomplete onSubmit={guess} />
          <button className="ghost" onClick={revealCell}>
            Reveal This Cell
          </button>
        </div>
      ) : null}
      {selected !== null && cells[selected].status !== "empty" ? (
        <AnswerList
          pokemon={intersection(...cellCats(selected))}
          title="This Cell's Answers"
          highlightId={cells[selected].pokemon?.id}
        />
      ) : null}
    </div>
  );
}

export default PracticeGrid;
