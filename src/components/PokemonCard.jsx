import PokemonName from "./PokemonName.jsx";
import Sprite from "./Sprite.jsx";

function PokemonCard({ pokemon, onClick, eager = false }) {
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
      </figcaption>
    </figure>
  );
}

export default PokemonCard;
