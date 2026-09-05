import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStats } from "../StatsContext.ts";
import { DEFAULT_EXCLUDED_GROUPS, generateGrid, gridPool } from "../logic/grid.ts";
import type { Grid } from "../logic/grid.ts";
import { intersection, pairKey } from "../logic/matching.ts";
import { CATEGORY_BY_ID, QUIZ_CATEGORIES, QUIZ_CATEGORY_GROUPS, getCategory, whyNot } from "../data/categories.ts";
import type { CategoryGroup } from "../data/categories.ts";
import { POKEMON_BY_ID } from "../data/pokedex.ts";
import type { PairStatsData, PickStatsCell, PickStatsPuzzle, Pokemon } from "../data/types.ts";
import { archivedAnswers, archivedShare, boardFromArchive, fetchPairStats, formatArchiveDate } from "../logic/archive.ts";
import type { ArchivedBoard } from "../logic/archive.ts";
import { loadJson, saveJson } from "../logic/hashState.ts";
import {
  cellUniqueness,
  estimatePickPercent,
  estimatePickPercents,
  formatPickEstimate,
  formatPickPercent,
} from "../logic/uniqueness.ts";
import ArchiveSheet from "./ArchiveSheet.tsx";
import CategoryPill from "./CategoryPill.tsx";
import Chevron from "./Chevron.tsx";
import PokemonName from "./PokemonName.tsx";
import Sprite from "./Sprite.tsx";
import GuessModal from "./GuessModal.tsx";
import AnswerList from "./AnswerList.tsx";
import ToggleGroup from "./ToggleGroup.tsx";

type CellStatus = "empty" | "filled" | "revealed";

// A pick this share of players (or more) reach for is a common one: its
// rate turns amber, and the result card names it
const COMMON_PICK = 25;
// PokeDoku's board score: nine cells, 100 minus the pick share each
const MAX_SCORE = 900;

// A filled cell's pick rate: the share (real or estimated) and its label
interface CellRate {
  share: number;
  text: string;
}

// "Gengar", "Gengar and Charizard", "Gengar, Charizard and Garchomp"
function listNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

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

// the real shares of a cell's picks, for the answer list's badges
function shareBadges(cell: PickStatsCell, answers: Pokemon[]): Map<number, string> {
  const badges = new Map<number, string>();
  for (const pokemon of answers) {
    const share = archivedShare(cell, pokemon);
    if (share > 0) badges.set(pokemon.id, formatPickPercent(share));
  }
  return badges;
}

// The real picks behind a cell, and when they were made, for the pick
// message ("picked by 39% of PokeDoku players <when>")
interface RealPicks {
  cell: PickStatsCell;
  when: string;
}

// a random grid's estimated pick shares, marked as estimates ("~12%"),
// for the answer list's badges; empty before any data is harvested
function estimateBadges(answers: Pokemon[]): Map<number, string> {
  const badges = new Map<number, string>();
  for (const [id, estimate] of estimatePickPercents(answers)) badges.set(id, formatPickEstimate(estimate));
  return badges;
}

function PracticeGrid() {
  const { merged, recordAttempt } = useStats();
  const [saved] = useState(loadBoard);
  const [grid, setGrid] = useState<Grid>(() => saved?.grid || generateGrid(merged));
  const [cells, setCells] = useState<Cell[]>(() => saved?.cells || emptyCells());
  // the past PokeDoku this board replays (its categories are the grid, its
  // pick counts the real pick rates), or null on a random grid
  const [archive, setArchive] = useState<ArchivedBoard | null>(saved?.archive ?? null);
  const [showBoards, setShowBoards] = useState(false);
  // real pick rates by category pair (public/archive/pairs.json): a random
  // grid's cell whose pair PokeDoku has run shows them in place of the
  // estimate. Null until fetched, or if it can't be
  const [pairStats, setPairStats] = useState<PairStatsData | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchPairStats()
      .then((table) => {
        if (!cancelled) setPairStats(table);
      })
      .catch(() => {
        // the estimates stand in
      });
    return () => {
      cancelled = true;
    };
  }, []);
  // the index of the tapped cell
  const [selected, setSelected] = useState<number | null>(null);
  const [excludedGroups, setExcludedGroups] = useState<CategoryGroup[]>(loadExcludedGroups);
  const [showGroups, setShowGroups] = useState(false);
  useEffect(() => saveJson(GROUPS_KEY, excludedGroups), [excludedGroups]);
  // Rows and columns of the next grid come from the groups left on; the
  // last one can't be turned off
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
  // The real picks a cell has, if any: the replayed PokeDoku's, or on a
  // random grid the summed picks of every archived board that ran its
  // pair. Null means the estimate stands in.
  const realPicks = (index: number): RealPicks | null => {
    if (archive) return { cell: archive.cells[index], when: "that day" };
    const entry = pairStats?.[pairKey(...cellCats(index))];
    if (!entry) return null;
    return {
      cell: entry,
      when: entry.boards === 1 ? "the day this pair ran" : `over the ${entry.boards} days this pair ran`,
    };
  };
  // what a cell accepts, least picked first: a replayed PokeDoku's own
  // answers by real share; otherwise the app's answers by real share where
  // the pair has run, with the estimate breaking ties or standing in
  const cellAnswers = (index: number): Pokemon[] => {
    const answers = intersection(...cellCats(index));
    if (archive) return archivedAnswers(archive, index, answers);
    const real = realPicks(index);
    const shares = new Map(answers.map((pokemon) => [pokemon.id, real ? archivedShare(real.cell, pokemon) : 0]));
    const estimates = estimatePickPercents(answers);
    const shareOf = (pokemon: Pokemon) => shares.get(pokemon.id) ?? 0;
    const estimateOf = (pokemon: Pokemon) => estimates.get(pokemon.id) ?? 0;
    // sorted on a copy: intersection's array is cached and shared
    return [...answers].sort((a, b) => shareOf(a) - shareOf(b) || estimateOf(a) - estimateOf(b));
  };

  // The finished board's uniqueness, PokeDoku-style: each filled cell adds
  // 100 minus its pick's share, real where known and estimated otherwise
  // (which makes the whole score an estimate); revealed cells add nothing
  const uniquenessScore = useMemo(() => {
    if (!done) return null;
    let score = 0;
    let estimated = false;
    for (const [index, cell] of cells.entries()) {
      if (cell.status !== "filled" || !cell.pokemon) continue;
      const row = grid.rows[Math.floor(index / 3)];
      const col = grid.cols[index % 3];
      const real = archive ? archive.cells[index] : pairStats?.[pairKey(row, col)];
      if (real) {
        score += 100 - archivedShare(real, cell.pokemon);
        continue;
      }
      const value = cellUniqueness(cell.pokemon, intersection(row, col));
      if (value === null) return null;
      score += value;
      estimated = true;
    }
    return { score: Math.round(score), estimated };
  }, [done, cells, grid, archive, pairStats]);
  // Closing the guess popup drops the selection and the tapped cell's
  // focus, whose ring would read as "still selected"; stable so the
  // popup's Escape listener isn't re-bound each render
  const closeCell = useCallback(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest(".board")) active.blur();
    setSelected(null);
    setMessage("");
    setWrongGuess(null);
  }, []);

  // A filled cell's highlight and answer panel clear when a tap lands
  // outside this tab's own content. `click`, not pointerdown, so a scroll
  // that starts on dead space doesn't tear it down.
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
    // a Pokémon PokeDoku leaves out of a category fits the app's rules, so
    // "why not" would have no clause
    const excludedHere =
      !correct && archive && (archive.excluded[selected].has(pokemon.species) || archive.excluded[selected].has(pokemon.id));
    if (excludedHere) {
      setMessage(`${pokemon.displayName} doesn't count here — PokeDoku leaves it out of this cell.`);
      setWrongGuess(pokemon);
    } else if (correct) {
      setCells((current) =>
        current.map((cell, index) => (index === selected ? { status: "filled", pokemon } : cell)),
      );
      // the board-local note: how many other open cells of this board the
      // pick could have filled (filled cells don't count, since the
      // no-repeat rule bars them)
      const elsewhere = Array.from({ length: 9 }, (_, index) => index).filter((index) => {
        if (index === selected || cells[index].status !== "empty") return false;
        const [row, col] = cellCats(index);
        return getCategory(row).predicate(pokemon) && getCategory(col).predicate(pokemon);
      }).length;
      let globally = "";
      const real = realPicks(selected);
      if (real) {
        const share = archivedShare(real.cell, pokemon);
        globally =
          share === 0
            ? `, picked by no one on PokeDoku ${real.when}`
            : `, picked by ${formatPickPercent(share)} of PokeDoku players ${real.when}`;
      } else {
        const estimate = estimatePickPercent(pokemon, answers);
        if (estimate !== null) globally = `, picked by ${formatPickEstimate(estimate)} of players globally`;
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
  const selectedReal = selected !== null && selectedCell && selectedCell.status !== "empty" ? realPicks(selected) : null;

  // Every filled cell's pick rate, the same figure as its answer card's
  // badge: the real share where the pair has run, an estimate otherwise
  // (none before any data is harvested)
  const cellRates: (CellRate | null)[] = cells.map((cell, index) => {
    if (cell.status !== "filled" || !cell.pokemon) return null;
    const real = realPicks(index);
    if (real) {
      const share = archivedShare(real.cell, cell.pokemon);
      return { share, text: formatPickPercent(share) };
    }
    const estimate = estimatePickPercent(cell.pokemon, intersection(...cellCats(index)));
    return estimate === null ? null : { share: estimate, text: formatPickEstimate(estimate) };
  });

  // The finished board's common picks, most common first, and what they
  // cost the score between them
  const commonPicks = cells
    .flatMap((cell, index) => {
      const rate = cellRates[index];
      return cell.pokemon && rate && rate.share >= COMMON_PICK ? [{ pokemon: cell.pokemon, share: rate.share }] : [];
    })
    .sort((a, b) => b.share - a.share);
  const commonCost = Math.round(commonPicks.reduce((sum, pick) => sum + pick.share, 0));
  const revealed = cells.filter((cell) => cell.status === "revealed").length;
  // where the finished board's rates came from
  const rateSource = archive
    ? `real PokeDoku pick rates from ${formatArchiveDate(archive.date, "short")}`
    : uniquenessScore === null
      ? null
      : uniquenessScore.estimated
        ? "estimated pick rates"
        : "real pick rates where the pair has run";

  return (
    <div className="practice" ref={rootRef}>
      <div className="grid-topbar">
        <button className="deck-choose" aria-haspopup="dialog" onClick={() => setShowBoards(true)}>
          {archive ? `PokeDoku · ${formatArchiveDate(archive.date, "short")}` : "Random grid"}
          <Chevron />
        </button>
        <div className="grid-tools">
          <p className="score">
            <b>{filled}</b>/9 · {guesses} guess{guesses === 1 ? "" : "es"}
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
            {/* once the board is done, a new one is the next thing to do */}
            <button className={done ? "primary" : "ghost"} onClick={newGame}>
              New Grid
            </button>
          </div>
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
            const rate = cellRates[index];
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
                  <>
                    <span className="cell-art">
                      <Sprite pokemon={cell.pokemon} />
                    </span>
                    <span className="cell-name">
                      <PokemonName name={cell.pokemon.displayName} />
                    </span>
                    {rate ? (
                      <span className={`cell-rate${rate.share >= COMMON_PICK ? " common" : ""}`}>{rate.text}</span>
                    ) : null}
                  </>
                ) : cell.status === "revealed" ? (
                  <>
                    <span className="cell-mark">✕</span>
                    <span className="cell-revealed">Revealed</span>
                  </>
                ) : (
                  ""
                )}
              </button>
            );
          }),
        ])}
      </div>
      {archive && !done ? (
        <p className="hint board-hint">
          PokeDoku&apos;s board from {formatArchiveDate(archive.date)} — same rules; pick rates are what its players
          chose that day.
        </p>
      ) : null}
      {done ? (
        <div className="result">
          <div className="result-card">
            <div className="result-score">
              <span className="result-kicker">Uniqueness</span>
              <span className="result-number">
                {uniquenessScore === null ? "—" : `${uniquenessScore.estimated ? "≈" : ""}${uniquenessScore.score}`}
                <span className="result-max"> /{MAX_SCORE}</span>
              </span>
            </div>
            <div className="result-detail">
              <div className="result-bar" aria-hidden="true">
                <div
                  className="result-fill"
                  style={{ width: `${uniquenessScore === null ? 0 : (100 * uniquenessScore.score) / MAX_SCORE}%` }}
                />
              </div>
              <span className="result-line">
                Board complete · {filled} filled · {guesses} guess{guesses === 1 ? "" : "es"}
                {revealed ? ` · ${revealed} revealed` : ""}
                {rateSource ? ` · ${rateSource}` : ""}
              </span>
              {commonPicks.length ? (
                <span className="result-note">
                  Amber rates are your most common picks —{" "}
                  {listNames(commonPicks.map((pick) => pick.pokemon.displayName))} cost {commonCost} point
                  {commonCost === 1 ? "" : "s"}
                  {commonPicks.length > 1 ? " between them" : ""}.
                </span>
              ) : null}
            </div>
          </div>
        </div>
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
          title={selectedReal ? "What PokeDoku Players Picked" : "This Cell's Answers"}
          highlightId={selectedCell.pokemon?.id}
          badges={selectedReal ? shareBadges(selectedReal.cell, selectedAnswers) : estimateBadges(selectedAnswers)}
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
