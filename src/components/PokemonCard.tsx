import type { KeyboardEvent } from "react";
import type { Pokemon } from "../data/types.ts";
import { formLabel } from "../logic/forms.ts";
import PokemonName from "./PokemonName.tsx";
import Sprite from "./Sprite.tsx";

// The name on a tile: the species over the form's own name on a second
// line ("Charizard" / "Mega X", "Lycanroc" / "Midday"); a Pokémon whose
// name has no form word takes one line
function CardName({ pokemon }: { pokemon: Pokemon }) {
  const form = formLabel(pokemon);
  if (form === pokemon.displayName) return <PokemonName name={pokemon.displayName} />;
  return (
    <>
      <PokemonName name={pokemon.speciesName} />
      <br />
      <span className="card-form">
        <PokemonName name={form} />
      </span>
    </>
  );
}

interface PokemonCardProps {
  pokemon: Pokemon;
  // when given, the card is a button that calls this
  onClick?: () => void;
  // load the sprite right away rather than lazily
  eager?: boolean;
  // a small cue in the corner, shown once the card is clickable
  hint?: string;
  // keep the name off the card entirely — caption, tooltip and alt text
  // (the Name deck asks who this is)
  hideName?: boolean;
  // a small figure in the corner: a replayed PokeDoku cell's real pick share
  badge?: string;
}

const MYSTERY = "Mystery Pokémon";

function PokemonCard({ pokemon, onClick, eager = false, hint, hideName = false, badge }: PokemonCardProps) {
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
      {/* a square slot the sprite fills (an answer-grid tile gives it whatever the caption leaves) */}
      <span className="card-art">
        <Sprite pokemon={pokemon} eager={eager} label={hideName ? MYSTERY : undefined} />
      </span>
      <figcaption title={hideName ? MYSTERY : pokemon.displayName}>
        <span className={hideName ? "card-name card-name-hidden" : "card-name"}>
          {hideName ? "???" : <CardName pokemon={pokemon} />}
        </span>
      </figcaption>
      {/* a small cue in the corner ("Details" once a flashcard can be clicked) */}
      {clickable && hint ? (
        <span className="card-hint" aria-hidden="true">
          {hint} ›
        </span>
      ) : null}
      {badge ? <span className="card-badge">{badge}</span> : null}
    </figure>
  );
}

export default PokemonCard;
