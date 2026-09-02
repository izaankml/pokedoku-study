import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStats } from "../StatsContext.ts";
import { DEFAULT_EXCLUDED_GROUPS, generateGrid, gridPool } from "../logic/grid.ts";
import type { Grid } from "../logic/grid.ts";
import { intersection, pairKey } from "../logic/matching.ts";
import { CATEGORY_BY_ID, QUIZ_CATEGORIES, QUIZ_CATEGORY_GROUPS, getCategory, whyNot } from "../data/categories.ts";
import type { CategoryGroup } from "../data/categories.ts";
import { POKEMON_BY_ID } from "../data/pokedex.ts";
import type { PickStatsPuzzle, Pokemon } from "../data/types.ts";
import { archivedAnswers, archivedShare, boardFromArchive, formatArchiveDate } from "../logic/archive.ts";
import type { ArchivedBoard } from "../logic/archive.ts";
import { loadJson, saveJson } from "../logic/hashState.ts";
import { cellUniqueness, estimatePickPercent, formatPickPercent } from "../logic/uniqueness.ts";
import ArchiveSheet from "./ArchiveSheet.tsx";
import CategoryPill from "./CategoryPill.tsx";
import Chevron from "./Chevron.tsx";
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

// What saveBoard writes: the grid, the cells by Pokémon id, the guess
// count, and the archived PokeDoku the board replays, if any.
interface StoredCell {
  status: CellStatus;
  pokemon: number | null;
}
interface StoredBoard {
  rows: string[];
  cols: string[];
  cells: StoredCell[];
  guesses: number;
  archive: PickStatsPuzzle | null;
}

interface SavedBoard {
  grid: Grid;
  cells: Cell[];
  guesses: number;
  archive: ArchivedBoard | null;
}

const isCategoryIdList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length === 3 && value.every((id) => typeof id === "string" && CATEGORY_BY_ID.has(id));

function loadBoard(): SavedBoard | null {
  const saved = loadJson(BOARD_KEY) as Partial<StoredBoard> | null;
  if (!saved || !isCategoryIdList(saved.rows) || !isCategoryIdList(saved.cols)) return null;
  if (!Array.isArray(saved.cells) || saved.cells.length !== 9) return null;
  // a replayed PokeDoku is rebuilt from the stored puzzle; one that can't
  // be (it shouldn't happen) starts the tab over on a random grid
  let archive: ArchivedBoard | null = null;
  if (saved.archive && typeof saved.archive === "object") {
    const load = boardFromArchive(saved.archive);
    if (!("board" in load)) return null;
    archive = load.board;
  }
  return {
    grid: archive ? archive.grid : { rows: saved.rows, cols: saved.cols },
    cells: saved.cells.map((cell: Partial<StoredCell>) => ({
      status: cell.status === "filled" || cell.status === "revealed" ? cell.status : "empty",
      pokemon: cell.status === "filled" && cell.pokemon != null ? (POKEMON_BY_ID.get(cell.pokemon) ?? null) : null,
    })),
    guesses: Number(saved.guesses) || 0,
    archive,
  };
}
function saveBoard(grid: Grid, cells: Cell[], guesses: number, archive: ArchivedBoard | null): void {
  saveJson(BOARD_KEY, {
    rows: grid.rows,
    cols: grid.cols,
    cells: cells.map((cell) => ({ status: cell.status, pokemon: cell.pokemon ? cell.pokemon.id : null })),
    guesses,
    archive: archive ? archive.puzzle : null,
  } satisfies StoredBoard);
}

// the real shares of a replayed cell's picks, for the answer list's badges
function shareBadges(board: ArchivedBoard, index: number, answers: Pokemon[]): Map<number, string> {
  const badges = new Map<number, string>();
  for (const pokemon of answers) {
    const share = archivedShare(board.cells[index], pokemon);
    if (share > 0) badges.set(pokemon.id, formatPickPercent(share));
  }
  return badges;
}

function PracticeGrid() {
  const { merged, recordAttempt } = useStats();
  const [saved] = useState(loadBoard);
  const [grid, setGrid] = useState<Grid>(() => saved?.grid || generateGrid(merged));
  const [cells, setCells] = useState<Cell[]>(() => saved?.cells || emptyCells());
  // the past PokeDoku this board replays — its categories are the grid,
  // its pick counts are the real pick rates — or null on a random grid
  const [archive, setArchive] = useState<ArchivedBoard | null>(saved?.archive ?? null);
  const [showBoards, setShowBoards] = useState(false);
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
  useEffect(() => saveBoard(grid, cells, guesses, archive), [grid, cells, guesses, archive]);

  const usedIds = useMemo(
    () => new Set(cells.flatMap((cell) => (cell.pokemon ? [cell.pokemon.id] : []))),
    [cells],
  );
  const done = cells.every((cell) => cell.status !== "empty");
  const filled = cells.filter((cell) => cell.status === "filled").length;

  const cellCats = (index: number): [string, string] => [grid.rows[Math.floor(index / 3)], grid.cols[index % 3]];
  // what a cell accepts: the app's answers, or on a replayed PokeDoku
  // those less its exclusions plus whatever its players validly picked
  const cellAnswers = (index: number): Pokemon[] => {
    const answers = intersection(...cellCats(index));
    return archive ? archivedAnswers(archive, index, answers) : answers;
  };

  // The finished board's global uniqueness, PokeDoku-style (0–900): each
  // filled cell adds 100 minus its pick's global pick share — the real
  // one on a replayed PokeDoku, an estimate otherwise; revealed cells
  // add nothing
  const uniquenessScore = useMemo(() => {
    if (!done) return null;
    let score = 0;
    for (const [index, cell] of cells.entries()) {
      if (cell.status !== "filled" || !cell.pokemon) continue;
      if (archive) {
        score += 100 - archivedShare(archive.cells[index], cell.pokemon);
        continue;
      }
      const pool = intersection(grid.rows[Math.floor(index / 3)], grid.cols[index % 3]);
      const value = cellUniqueness(cell.pokemon, pool);
      if (value === null) return null;
      score += value;
    }
    return Math.round(score);
  }, [done, cells, grid, archive]);
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
    const answers = cellAnswers(selected);
    const correct = answers.some((answer) => answer.id === pokemon.id);
    recordAttempt({
      categories: [rowId, colId],
      pair: pairKey(rowId, colId),
      correct,
    });
    setGuesses((count) => count + 1);
    // a Pokémon PokeDoku leaves out of a category (Pikachu, Eevee from
    // First Partner) fits the app's rules, so "why not" would have no clause
    const excludedHere =
      !correct && archive && (archive.excluded[selected].has(pokemon.species) || archive.excluded[selected].has(pokemon.id));
    if (excludedHere) {
      setMessage(`${pokemon.displayName} doesn't count here — PokeDoku leaves it out of this cell.`);
      setWrongGuess(pokemon);
    } else if (correct) {
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
      let globally = "";
      if (archive) {
        const share = archivedShare(archive.cells[selected], pokemon);
        globally =
          share === 0
            ? ", picked by no one on PokeDoku that day"
            : `, picked by ${formatPickPercent(share)} of PokeDoku players that day`;
      } else {
        const estimate = estimatePickPercent(pokemon, answers);
        if (estimate !== null) globally = `, picked by ~${formatPickPercent(estimate)} of players globally`;
      }
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

  function startBoard(nextGrid: Grid, nextArchive: ArchivedBoard | null) {
    setArchive(nextArchive);
    setGrid(nextGrid);
    setCells(emptyCells());
    setSelected(null);
    setGuesses(0);
    setMessage("");
    setWrongGuess(null);
    setShowBoards(false);
  }

  function newGame() {
    startBoard(generateGrid(merged, { pool: gridPool(excludedGroups) }), null);
  }

  // a past PokeDoku from the chooser: why it can't be played, or null
  function playArchive(puzzle: PickStatsPuzzle): string | null {
    const load = boardFromArchive(puzzle);
    if ("unplayable" in load) return load.unplayable;
    startBoard(load.board.grid, load.board);
    return null;
  }

  const selectedCell = selected !== null ? cells[selected] : null;
  const selectedAnswers = selected !== null && selectedCell && selectedCell.status !== "empty" ? cellAnswers(selected) : [];

  return (
    <div className="practice" ref={rootRef}>
      <div className="grid-topbar">
        <button className="deck-choose" aria-haspopup="dialog" onClick={() => setShowBoards(true)}>
          {archive ? `PokeDoku · ${formatArchiveDate(archive.date, "short")}` : "Random grid"}
          <Chevron />
        </button>
      </div>
      <p className="hint">
        {archive
          ? `PokeDoku's board from ${formatArchiveDate(archive.date)} — same rules; pick rates are what its players chose that day.`
          : "Fill all nine cells — each Pokémon must fit its row and column, no repeats."}
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
          {done
            ? uniquenessScore === null
              ? " — done!"
              : ` — done! · uniqueness ${archive ? "" : "≈"}${uniquenessScore}/900`
            : ""}
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
          pokemon={selectedAnswers}
          title={archive ? "What PokeDoku Players Picked" : "This Cell's Answers"}
          highlightId={selectedCell.pokemon?.id}
          badges={archive ? shareBadges(archive, selected, selectedAnswers) : undefined}
        />
      ) : null}
      {showBoards ? (
        <ArchiveSheet
          activeId={archive ? archive.id : null}
          onPick={playArchive}
          onRandom={newGame}
          onClose={() => setShowBoards(false)}
        />
      ) : null}
    </div>
  );
}

export default PracticeGrid;
