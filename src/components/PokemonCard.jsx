import PokemonName from "./PokemonName.jsx";
import Sprite from "./Sprite.jsx";

function PokemonCard({ pokemon, caption, onClick, eager = false }) {
  const clickable = typeof onClick === "function";
  return (
    <figure
      className={`pokemon-card${clickable ? " clickable" : ""}`}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
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
        {caption ? <span className="card-caption">{caption}</span> : null}
      </figcaption>
    </figure>
  );
}

export default PokemonCard;
