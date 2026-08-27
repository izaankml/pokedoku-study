import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStats } from "../StatsContext.ts";
import { DEFAULT_EXCLUDED_GROUPS, generateGrid, gridPool } from "../logic/grid.ts";
import type { Grid } from "../logic/grid.ts";
import { intersection, pairKey } from "../logic/matching.ts";
import { CATEGORY_BY_ID, QUIZ_CATEGORIES, QUIZ_CATEGORY_GROUPS, getCategory, whyNot } from "../data/categories.ts";
import type { CategoryGroup } from "../data/categories.ts";
import { POKEMON_BY_ID } from "../data/pokedex.ts";
import type { Pokemon } from "../data/types.ts";
import { loadJson, saveJson } from "../logic/hashState.ts";
import { cellUniqueness, estimatePickPercent, formatPickPercent } from "../logic/uniqueness.ts";
import CategoryPill from "./CategoryPill.tsx";
import Sprite from "./Sprite.tsx";
import GuessModal from "./GuessModal.tsx";
import AnswerList from "./AnswerList.tsx";
import ToggleGroup from "./ToggleGroup.tsx";

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
// only the quizzed groups: a stored Browse-only id would count against
// the "last group can't be turned off" budget without a visible toggle
const GROUP_IDS = new Set<string>(QUIZ_CATEGORY_GROUPS.map(([group]) => group));
const isCategoryGroup = (value: unknown): value is CategoryGroup => typeof value === "string" && GROUP_IDS.has(value);
// how many grid-drawable categories each group holds (the panel's badges)
const GROUP_COUNTS = new Map<CategoryGroup, number>(
  QUIZ_CATEGORY_GROUPS.map(([group]) => [group, QUIZ_CATEGORIES.filter((category) => category.group === group).length]),
);
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
  // one can't be turned off (QUIZ_CATEGORY_GROUPS is what the panel
  // shows — the Browse-only fun group isn't part of the budget)
  function toggleGroup(group: CategoryGroup) {
    setExcludedGroups((excluded) =>
      excluded.includes(group)
        ? excluded.filter((other) => other !== group)
        : excluded.length < QUIZ_CATEGORY_GROUPS.length - 1
          ? [...excluded, group]
          : excluded,
    );
  }
  const [guesses, setGuesses] = useState(saved?.guesses || 0);
  const [message, setMessage] = useState("");
  // the Pokémon behind the current wrong-guess message (its tile in the
  // popup opens the detail sheet)
  const [wrongGuess, setWrongGuess] = useState<Pokemon | null>(null);
  useEffect(() => saveBoard(grid, cells, guesses), [grid, cells, guesses]);

  const usedIds = useMemo(
    () => new Set(cells.flatMap((cell) => (cell.pokemon ? [cell.pokemon.id] : []))),
    [cells],
  );
  const done = cells.every((cell) => cell.status !== "empty");
  const filled = cells.filter((cell) => cell.status === "filled").length;

  const cellCats = (index: number): [string, string] => [grid.rows[Math.floor(index / 3)], grid.cols[index % 3]];

  // The finished board's global uniqueness, PokeDoku-style (0–900): each
  // filled cell adds 100 minus its pick's estimated global pick share;
  // revealed cells add nothing
  const uniquenessScore = useMemo(() => {
    if (!done) return null;
    let score = 0;
    for (const [index, cell] of cells.entries()) {
      if (cell.status !== "filled" || !cell.pokemon) continue;
      const pool = intersection(grid.rows[Math.floor(index / 3)], grid.cols[index % 3]);
      const value = cellUniqueness(cell.pokemon, pool);
      if (value === null) return null;
      score += value;
    }
    return Math.round(score);
  }, [done, cells, grid]);
  // Closing the guess popup (×, backdrop, Escape) drops the selection —
  // and the tapped cell's focus, whose ring reads as "still selected" on
  // iOS; stable so the popup's Escape listener isn't re-bound each render
  const closeCell = useCallback(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest(".board")) active.blur();
    setSelected(null);
    setMessage("");
    setWrongGuess(null);
  }, []);

  // A filled cell's highlight (and its answer panel) clears when a tap
  // lands outside this tab's own content, instead of lingering until
  // another cell is picked. `click`, not pointerdown: a drag that starts
  // on dead space (scrolling toward the panel) must not tear it down.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedStatus = selected === null ? null : cells[selected].status;
  useEffect(() => {
    if (selected === null || selectedStatus === "empty") return undefined;
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      // inside the tab (board, toolbar, answer panel) keeps the selection;
      // so does the detail sheet, which portals to <body>
      if (rootRef.current?.contains(target) || target.closest(".modal-backdrop")) return;
      setSelected(null);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [selected, selectedStatus]);

  function guess(pokemon: Pokemon) {
    if (selected === null) return;
    const [rowId, colId] = cellCats(selected);
    if (usedIds.has(pokemon.id)) {
      setMessage(`${pokemon.displayName} is already on the board.`);
      setWrongGuess(null); // the previous miss's tile must not outlive its message
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
      // Global rarity comes from the harvested PokeDoku pick prior
      // (logic/uniqueness.ts); the board-local note stays: how many other
      // cells of this board the pick could have filled (membership is
      // just the two predicates — no member lists needed; only cells
      // still open count, since the no-repeat rule bars the rest)
      const elsewhere = Array.from({ length: 9 }, (_, index) => index).filter((index) => {
        if (index === selected || cells[index].status !== "empty") return false;
        const [row, col] = cellCats(index);
        return getCategory(row).predicate(pokemon) && getCategory(col).predicate(pokemon);
      }).length;
      const estimate = estimatePickPercent(pokemon, answers);
      const globally = estimate === null ? "" : `, picked by ~${formatPickPercent(estimate)} of players globally`;
      const board =
        elsewhere === 0
          ? "fits no other open cell here"
          : `also fits ${elsewhere} other open cell${elsewhere === 1 ? "" : "s"} here`;
      setMessage(`${pokemon.displayName} fits! One of ${answers.length} for this cell${globally}; ${board}.`);
      setSelected(null);
      setWrongGuess(null);
    } else {
      setMessage(`${pokemon.displayName} doesn't fit — it ${whyNot(pokemon, [rowId, colId])}.`);
      setWrongGuess(pokemon);
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
    setWrongGuess(null);
  }

  function newGame() {
    setGrid(generateGrid(merged, { pool: gridPool(excludedGroups) }));
    setCells(emptyCells());
    setSelected(null);
    setGuesses(0);
    setMessage("");
    setWrongGuess(null);
  }

  const selectedCell = selected !== null ? cells[selected] : null;

  return (
    <div className="practice" ref={rootRef}>
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
                  // tapping the selected filled cell again deselects it
                  setSelected((current) => (current === index ? null : index));
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
          {done ? (uniquenessScore === null ? " — done!" : ` — done! · uniqueness ≈${uniquenessScore}/900`) : ""}
        </p>
        <div className="board-actions">
          <button
            className={`ghost${showGroups ? " on" : ""}`}
            aria-expanded={showGroups}
            aria-controls={showGroups ? "grid-groups" : undefined}
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
        <ToggleGroup
          id="grid-groups"
          title="Category groups for new grids"
          toggles={QUIZ_CATEGORY_GROUPS.map(([group, label]) => ({
            id: group,
            label,
            included: !excludedGroups.includes(group),
            count: GROUP_COUNTS.get(group) ?? 0,
          }))}
          onToggle={(groupId) => {
            if (isCategoryGroup(groupId)) toggleGroup(groupId);
          }}
          hint="Takes effect on the next New Grid."
        />
      ) : null}
      <p key={message} className="grid-message">
        {message || " "}
      </p>
      {selected !== null && selectedCell && selectedCell.status === "empty" ? (
        <GuessModal
          categories={cellCats(selected)}
          message={message}
          wrongGuess={wrongGuess}
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
