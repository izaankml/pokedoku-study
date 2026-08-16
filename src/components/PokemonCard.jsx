import { useState } from "react";
import { spriteUrl } from "../data/pokedex.js";

function PokemonCard({ pokemon, caption }) {
  const [broken, setBroken] = useState(false);
  return (
    <figure className="pokemon-card">
      {broken ? (
        <div className="sprite-fallback">{pokemon.displayName[0]}</div>
      ) : (
        <img
          className="sprite"
          src={spriteUrl(pokemon.id)}
          alt={pokemon.displayName}
          loading="lazy"
          onError={() => setBroken(true)}
        />
      )}
      <figcaption>
        {pokemon.displayName}
        {caption ? <span className="card-caption">{caption}</span> : null}
      </figcaption>
    </figure>
  );
}

export default PokemonCard;
