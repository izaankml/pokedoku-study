import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getCategory } from "../data/categories.ts";
import type { Pokemon } from "../data/types.ts";
import { guessFilterFor } from "../logic/matching.ts";
import CategoryPill from "./CategoryPill.tsx";
import PokemonAutocomplete from "./PokemonAutocomplete.tsx";
import PokemonCard from "./PokemonCard.tsx";
import PokemonDetail from "./PokemonDetail.tsx";
import { useModalShell } from "./useModalShell.ts";

interface GuessModalProps {
  // the cell's row and column category ids
  categories: [string, string];
  // the verdict on the last guess (a wrong one keeps the popup open)
  message: string;
  // the Pokémon behind a wrong verdict — shown as a tile that opens its
  // detail sheet, so "why doesn't it fit" is one tap away
  wrongGuess?: Pokemon | null;
  onGuess: (pokemon: Pokemon) => void;
  onReveal: () => void;
  onClose: () => void;
}

// The popup a tapped cell opens, as on PokeDoku: the cell's two
// categories, the search box, and a way to give the cell up.
function GuessModal({ categories, message, wrongGuess = null, onGuess, onReveal, onClose }: GuessModalProps) {
  // the detail sheet stacked over this popup (from the wrong-guess tile);
  // while it is up, Escape and the backdrop belong to it, not the popup
  const [inspect, setInspect] = useState<Pokemon | null>(null);
  const inspectRef = useRef(inspect);
  inspectRef.current = inspect;
  const close = useCallback(() => {
    if (inspectRef.current) return;
    onClose();
  }, [onClose]);
  useModalShell(close);
  const [rowCat, colCat] = categories;

  return createPortal(
    <>
      <div className="modal-backdrop" onClick={close}>
        <div
          className="modal guess"
          role="dialog"
          aria-modal="true"
          aria-labelledby="guess-title"
          onClick={(event) => event.stopPropagation()}
        >
          {/* through the guard: with a detail sheet stacked on top, × must
              not tear down the whole stack from behind it */}
          <button className="modal-close" aria-label="Close" onClick={close}>
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
          {wrongGuess ? (
            <div className="wrong-guess">
              <PokemonCard pokemon={wrongGuess} eager hint="Why Not?" onClick={() => setInspect(wrongGuess)} />
            </div>
          ) : null}
          <div className="action-row">
            <button className="ghost" onClick={onReveal}>
              Reveal This Cell
            </button>
          </div>
        </div>
      </div>
      {/* a sibling of the backdrop, not a child: its clicks must not
          bubble (in the React tree) into the backdrop's close */}
      {inspect ? <PokemonDetail pokemon={inspect} onClose={() => setInspect(null)} onOpen={setInspect} /> : null}
    </>,
    document.body,
  );
}

export default GuessModal;
