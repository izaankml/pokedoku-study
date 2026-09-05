import { useEffect, useState } from "react";
import type { PickArchiveIndex, PickStatsPuzzle } from "../data/types.ts";
import { fetchArchiveIndex, fetchArchivedPuzzle, formatArchiveDate } from "../logic/archive.ts";
import { useModalShell } from "./useModalShell.ts";

interface ArchiveSheetProps {
  // the replayed board's id, or null on a random grid
  activeId: number | null;
  // why the board can't be played, or null once it is on the table
  onPick: (puzzle: PickStatsPuzzle) => string | null;
  onRandom: () => void;
  onClose: () => void;
}

// The bottom sheet the board chooser opens: a fresh random grid, or any
// past PokeDoku the harvest saw while it was current. Only those carry
// their categories; boards backfilled after their day aren't listed.
function ArchiveSheet({ activeId, onPick, onRandom, onClose }: ArchiveSheetProps) {
  useModalShell(onClose);
  const [index, setIndex] = useState<PickArchiveIndex | null>(null);
  const [problem, setProblem] = useState("");
  const [loadingId, setLoadingId] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchArchiveIndex()
      .then((entries) => {
        if (!cancelled) setIndex(entries);
      })
      .catch(() => {
        if (!cancelled) setProblem("Couldn't load the list of past boards. Check your connection and try again.");
      });
    return () => {
      cancelled = true;
    };
  }, []);
  // newest day first; the index is by id, and PokeDoku's ids aren't in date order
  const boards = (index ?? [])
    .flatMap((entry) => (entry.date ? [{ id: entry.id, date: entry.date }] : []))
    .sort((a, b) => b.date.localeCompare(a.date));

  async function pick(id: number) {
    setLoadingId(id);
    setProblem("");
    try {
      const unplayable = onPick(await fetchArchivedPuzzle(id));
      if (unplayable) {
        setProblem(unplayable);
        setLoadingId(null);
      }
    } catch {
      setProblem("Couldn't load that board. Check your connection and try again.");
      setLoadingId(null);
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet archive-sheet" role="dialog" aria-label="Pick a board" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-head">
          <h3 className="sheet-title">Pick a board</h3>
        </div>
        <div className="archive-rows">
          <button className={`deck-row${activeId === null ? " active" : ""}`} onClick={onRandom}>
            <span className="deck-row-text">
              <span className="deck-row-label">Random grid</span>
              <span className="deck-row-desc">A new board from the category groups you left on</span>
            </span>
            {activeId === null ? <span className="deck-check">✓</span> : null}
          </button>
          <p className="sheet-kicker">Past PokeDokus · real pick rates</p>
          {index === null && !problem ? <p className="hint">Loading…</p> : null}
          {index !== null && boards.length === 0 ? (
            <p className="hint">No past boards yet. The first arrives the morning after a daily.</p>
          ) : null}
          {boards.map((board) => (
            <button
              key={board.id}
              className={`deck-row${activeId === board.id ? " active" : ""}`}
              disabled={loadingId !== null}
              onClick={() => void pick(board.id)}
            >
              <span className="deck-row-text">
                <span className="deck-row-label">{formatArchiveDate(board.date)}</span>
                <span className="deck-row-desc">
                  PokeDoku #{board.id}
                  {loadingId === board.id ? " · loading…" : ""}
                </span>
              </span>
              {activeId === board.id ? <span className="deck-check">✓</span> : null}
            </button>
          ))}
        </div>
        {problem ? <p className="hint archive-problem">{problem}</p> : null}
      </div>
    </div>
  );
}

export default ArchiveSheet;
