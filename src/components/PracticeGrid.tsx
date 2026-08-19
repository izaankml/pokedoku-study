import { useCallback, useEffect, useMemo, useState } from "react";
import { useStats } from "../StatsContext.ts";
import { DEFAULT_EXCLUDED_GROUPS, generateGrid, gridPool } from "../logic/grid.ts";
import type { Grid } from "../logic/grid.ts";
import { intersection, pairKey } from "../logic/matching.ts";
import { CATEGORIES, CATEGORY_BY_ID, CATEGORY_GROUPS, getCategory, whyNot } from "../data/categories.ts";
import type { CategoryGroup } from "../data/categories.ts";
import { POKEMON_BY_ID } from "../data/pokedex.ts";
import type { Pokemon } from "../data/types.ts";
import { loadJson, saveJson } from "../logic/hashState.ts";
import CategoryPill from "./CategoryPill.tsx";
import Sprite from "./Sprite.tsx";
import GuessModal from "./GuessModal.tsx";
import AnswerList from "./AnswerList.tsx";

type CellStatus = "empty" | "filled" | "revealed";

interface Cell {
  status: CellStatus;
  // the Pokémon placed here, once filled
  pokemon: Pokemon | null;
}

const emptyCells = (): Cell[] => Array.from({ length: 9 }, () => ({ status: "empty", pokemon: null }));

// The board in progress survives a reload (cells hold Pokémon ids on disk).
const BOARD_KEY = "pokedoku-study:grid:v1";
// Which category groups new grids leave out (see gridPool in logic/grid.ts)
const GROUPS_KEY = "pokedoku-study:grid-excluded-groups:v1";
const GROUP_IDS = new Set<string>(CATEGORY_GROUPS.map(([group]) => group));
const isCategoryGroup = (value: unknown): value is CategoryGroup => typeof value === "string" && GROUP_IDS.has(value);
function loadExcludedGroups(): CategoryGroup[] {
  const saved = loadJson(GROUPS_KEY);
  if (!Array.isArray(saved)) return DEFAULT_EXCLUDED_GROUPS;
  return saved.filter(isCategoryGroup);
}

// What saveBoard writes: the grid, the cells by Pokémon id, the guess count.
interface StoredCell {
  status: CellStatus;
  pokemon: number | null;
}
interface StoredBoard {
  rows: string[];
  cols: string[];
  cells: StoredCell[];
  guesses: number;
}

interface SavedBoard {
  grid: Grid;
  cells: Cell[];
  guesses: number;
}

const isCategoryIdList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length === 3 && value.every((id) => typeof id === "string" && CATEGORY_BY_ID.has(id));

function loadBoard(): SavedBoard | null {
  const saved = loadJson(BOARD_KEY) as Partial<StoredBoard> | null;
  if (!saved || !isCategoryIdList(saved.rows) || !isCategoryIdList(saved.cols)) return null;
  if (!Array.isArray(saved.cells) || saved.cells.length !== 9) return null;
  return {
    grid: { rows: saved.rows, cols: saved.cols },
    cells: saved.cells.map((cell: Partial<StoredCell>) => ({
      status: cell.status === "filled" || cell.status === "revealed" ? cell.status : "empty",
      pokemon: cell.status === "filled" && cell.pokemon != null ? (POKEMON_BY_ID.get(cell.pokemon) ?? null) : null,
    })),
    guesses: Number(saved.guesses) || 0,
  };
}
function saveBoard(grid: Grid, cells: Cell[], guesses: number): void {
  saveJson(BOARD_KEY, {
    rows: grid.rows,
    cols: grid.cols,
    cells: cells.map((cell) => ({ status: cell.status, pokemon: cell.pokemon ? cell.pokemon.id : null })),
    guesses,
  } satisfies StoredBoard);
}

function PracticeGrid() {
  const { merged, recordAttempt } = useStats();
  const [saved] = useState(loadBoard);
  const [grid, setGrid] = useState<Grid>(() => saved?.grid || generateGrid(merged));
  const [cells, setCells] = useState<Cell[]>(() => saved?.cells || emptyCells());
  // the index of the tapped cell
  const [selected, setSelected] = useState<number | null>(null);
  const [excludedGroups, setExcludedGroups] = useState<CategoryGroup[]>(loadExcludedGroups);
  const [showGroups, setShowGroups] = useState(false);
  useEffect(() => saveJson(GROUPS_KEY, excludedGroups), [excludedGroups]);
  // Rows/columns of the next grid come from the groups left on; the last
  // one can't be turned off
  function toggleGroup(group: CategoryGroup) {
    setExcludedGroups((excluded) =>
      excluded.includes(group)
        ? excluded.filter((other) => other !== group)
        : excluded.length < CATEGORY_GROUPS.length - 1
          ? [...excluded, group]
          : excluded,
    );
  }
  const [guesses, setGuesses] = useState(saved?.guesses || 0);
  const [message, setMessage] = useState("");
  useEffect(() => saveBoard(grid, cells, guesses), [grid, cells, guesses]);

  const usedIds = useMemo(
    () => new Set(cells.flatMap((cell) => (cell.pokemon ? [cell.pokemon.id] : []))),
    [cells],
  );
  const done = cells.every((cell) => cell.status !== "empty");
  const filled = cells.filter((cell) => cell.status === "filled").length;

  const cellCats = (index: number): [string, string] => [grid.rows[Math.floor(index / 3)], grid.cols[index % 3]];
  // Closing the guess popup (×, backdrop, Escape) drops the selection;
  // stable so the popup's Escape listener isn't re-bound each render
  const closeCell = useCallback(() => {
    setSelected(null);
    setMessage("");
  }, []);

  function guess(pokemon: Pokemon) {
    if (selected === null) return;
    const [rowId, colId] = cellCats(selected);
    if (usedIds.has(pokemon.id)) {
      setMessage(`${pokemon.displayName} is already on the board.`);
      return;
    }
    const answers = intersection(rowId, colId);
    const correct = answers.some((answer) => answer.id === pokemon.id);
    recordAttempt({
      categories: [rowId, colId],
      pair: pairKey(rowId, colId),
      correct,
    });
    setGuesses((count) => count + 1);
    if (correct) {
      setCells((current) =>
        current.map((cell, index) => (index === selected ? { status: "filled", pokemon } : cell)),
      );
      setMessage(`${pokemon.displayName} fits!`);
      setSelected(null);
    } else {
      setMessage(`${pokemon.displayName} doesn't fit — it ${whyNot(pokemon, [rowId, colId])}.`);
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
    setCells((current) =>
      current.map((cell, index) => (index === selected ? { status: "revealed", pokemon: null } : cell)),
    );
    setMessage("");
  }

  function newGame() {
    setGrid(generateGrid(merged, { pool: gridPool(excludedGroups) }));
    setCells(emptyCells());
    setSelected(null);
    setGuesses(0);
    setMessage("");
  }

  const selectedCell = selected !== null ? cells[selected] : null;

  return (
    <div className="practice">
      <p className="hint">
        Fill all nine cells — each Pokémon must fit its row and column, no
        repeats.
      </p>
      <div className="board">
        <div className="corner" />
        {grid.cols.map((colId) => (
          <div key={colId} className="header">
            <CategoryPill cat={getCategory(colId)} useShort />
          </div>
        ))}
        {grid.rows.map((rowId, rowIndex) => [
          <div key={rowId} className="header">
            <CategoryPill cat={getCategory(rowId)} useShort />
          </div>,
          ...grid.cols.map((colId, colIndex) => {
            const index = rowIndex * 3 + colIndex;
            const cell = cells[index];
            let className = "cell";
            if (index === selected) className += " selected";
            if (cell.status === "filled") className += " filled";
            if (cell.status === "revealed") className += " revealed";
            return (
              <button
                key={colId}
                className={className}
                onClick={() => {
                  setSelected(index);
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
        <div className="board-actions">
          <button
            className={`ghost${showGroups ? " on" : ""}`}
            aria-expanded={showGroups}
            aria-controls="grid-groups"
            onClick={() => setShowGroups((on) => !on)}
          >
            Categories
          </button>
          <button className="ghost" onClick={newGame}>
            New Grid
          </button>
        </div>
      </div>
      {showGroups ? (
        <fieldset id="grid-groups" className="grid-groups">
          <legend>Category groups for new grids</legend>
          <div className="grid-groups-list">
            {CATEGORY_GROUPS.map(([group, label]) => {
              const on = !excludedGroups.includes(group);
              const count = CATEGORIES.filter((category) => category.group === group).length;
              return (
                <label key={group} className={`group-toggle${on ? " on" : ""}`}>
                  <input type="checkbox" checked={on} onChange={() => toggleGroup(group)} />
                  {label} <span className="group-count">{count}</span>
                </label>
              );
            })}
          </div>
          <p className="hint">Takes effect on the next New Grid.</p>
        </fieldset>
      ) : null}
      <p key={message} className="grid-message">
        {message || " "}
      </p>
      {selected !== null && selectedCell && selectedCell.status === "empty" ? (
        <GuessModal
          categories={cellCats(selected)}
          message={message}
          onGuess={guess}
          onReveal={revealCell}
          onClose={closeCell}
        />
      ) : null}
      {selected !== null && selectedCell && selectedCell.status !== "empty" ? (
        <AnswerList
          pokemon={intersection(...cellCats(selected))}
          title="This Cell's Answers"
          highlightId={selectedCell.pokemon?.id}
        />
      ) : null}
    </div>
  );
}

export default PracticeGrid;
