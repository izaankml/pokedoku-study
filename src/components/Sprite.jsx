import { useState } from "react";
import { spriteUrl } from "../data/pokedex.js";

// Poké Ball silhouette shown whenever a sprite fails to load, so the
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

function Sprite({ pokemon, className = "sprite" }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <div className={`sprite-fallback ${className}`} title={pokemon.displayName}>
        <PokeballIcon />
      </div>
    );
  }
  return (
    <img
      className={className}
      src={spriteUrl(pokemon.id)}
      alt={pokemon.displayName}
      loading="lazy"
      onError={() => setBroken(true)}
    />
  );
}

export default Sprite;
