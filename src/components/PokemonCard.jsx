import Sprite from "./Sprite.jsx";

function PokemonCard({ pokemon, caption }) {
  return (
    <figure className="pokemon-card">
      <Sprite pokemon={pokemon} />
      <figcaption title={pokemon.displayName}>
        {pokemon.displayName}
        {caption ? <span className="card-caption">{caption}</span> : null}
      </figcaption>
    </figure>
  );
}

export default PokemonCard;
