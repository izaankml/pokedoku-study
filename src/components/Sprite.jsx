import { useEffect, useState } from "react";
import { spriteCandidates } from "../data/pokedex.js";

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

// Falls back to the base species' sprite, then the silhouette.
function Sprite({ pokemon, className = "sprite", eager = false }) {
  const [attempt, setAttempt] = useState(0);
  useEffect(() => setAttempt(0), [pokemon.id]);
  const urls = spriteCandidates(pokemon);
  if (attempt >= urls.length) {
    return (
      <div className={`sprite-fallback ${className}`} title={pokemon.displayName}>
        <PokeballIcon />
      </div>
    );
  }
  return (
    // keyed by Pokémon so a change never shows the previous sprite while
    // the new one loads
    <img
      key={pokemon.id}
      className={className}
      src={urls[attempt]}
      alt={pokemon.displayName}
      loading={eager ? "eager" : "lazy"}
      decoding="sync"
      onError={() => setAttempt((a) => a + 1)}
    />
  );
}

export default Sprite;
