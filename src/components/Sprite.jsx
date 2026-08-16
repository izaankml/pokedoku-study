import { useEffect, useState } from "react";
import { spriteUrl } from "../data/pokedex.js";

// Poké Ball silhouette shown whenever no sprite loads, so the
// offline/broken state still looks intentional.
export function PokeballIcon(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h6.6M14.4 12H21" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );
}

// A form whose own sprite is missing upstream (Partner Pikachu, Mega
// Zygarde) falls back to its base species' sprite before the silhouette.
function candidates(pokemon) {
  const ids = [pokemon.id];
  if (pokemon.species !== pokemon.id) ids.push(pokemon.species);
  return ids.map(spriteUrl);
}

function Sprite({ pokemon, className = "sprite" }) {
  const [attempt, setAttempt] = useState(0);
  useEffect(() => setAttempt(0), [pokemon.id]);
  const urls = candidates(pokemon);
  if (attempt >= urls.length) {
    return (
      <div className={`sprite-fallback ${className}`} title={pokemon.displayName}>
        <PokeballIcon />
      </div>
    );
  }
  return (
    <img
      className={className}
      src={urls[attempt]}
      alt={pokemon.displayName}
      loading="lazy"
      onError={() => setAttempt((a) => a + 1)}
    />
  );
}

export default Sprite;
