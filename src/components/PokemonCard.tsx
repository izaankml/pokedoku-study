import type { KeyboardEvent } from "react";
import type { Pokemon } from "../data/types.ts";
import PokemonName from "./PokemonName.tsx";
import Sprite from "./Sprite.tsx";

interface PokemonCardProps {
  pokemon: Pokemon;
  // when given, the card is a button that calls this
  onClick?: () => void;
  // load the sprite right away rather than lazily
  eager?: boolean;
  // a small cue in the corner, shown once the card is clickable
  hint?: string;
}

function PokemonCard({ pokemon, onClick, eager = false, hint }: PokemonCardProps) {
  const clickable = typeof onClick === "function";
  return (
    <figure
      className={`pokemon-card${clickable ? " clickable" : ""}`}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        clickable
          ? (event: KeyboardEvent<HTMLElement>) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <Sprite pokemon={pokemon} eager={eager} />
      <figcaption title={pokemon.displayName}>
        <span className="card-name">
          <PokemonName name={pokemon.displayName} />
        </span>
      </figcaption>
      {/* a small cue in the corner (e.g. "View Detail" once a card can be clicked) */}
      {clickable && hint ? (
        <span className="card-hint" aria-hidden="true">
          {hint}
        </span>
      ) : null}
    </figure>
  );
}

export default PokemonCard;
