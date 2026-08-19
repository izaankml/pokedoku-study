import { createPortal } from "react-dom";
import { getCategory } from "../data/categories.ts";
import type { Pokemon } from "../data/types.ts";
import { guessFilterFor } from "../logic/matching.ts";
import CategoryPill from "./CategoryPill.tsx";
import PokemonAutocomplete from "./PokemonAutocomplete.tsx";
import { useModalShell } from "./useModalShell.ts";

interface GuessModalProps {
  // the cell's row and column category ids
  categories: [string, string];
  // the verdict on the last guess (a wrong one keeps the popup open)
  message: string;
  onGuess: (pokemon: Pokemon) => void;
  onReveal: () => void;
  onClose: () => void;
}

// The popup a tapped cell opens, as on PokeDoku: the cell's two
// categories, the search box, and a way to give the cell up.
function GuessModal({ categories, message, onGuess, onReveal, onClose }: GuessModalProps) {
  useModalShell(onClose);
  const [rowCat, colCat] = categories;

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal guess"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guess-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="modal-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <h3 id="guess-title">Make your guess</h3>
        <div className="question">
          <CategoryPill cat={getCategory(rowCat)} />
          <span className="times">×</span>
          <CategoryPill cat={getCategory(colCat)} />
        </div>
        <PokemonAutocomplete onSubmit={onGuess} eligible={guessFilterFor(categories)} autoFocus />
        <p key={message} className="grid-message">
          {message || " "}
        </p>
        <div className="action-row">
          <button className="ghost" onClick={onReveal}>
            Reveal This Cell
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default GuessModal;
