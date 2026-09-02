import { spriteCandidates } from "../data/pokedex.ts";
import type { Pokemon } from "../data/types.ts";

// Warms the browser cache so a sprite is on screen the moment it's needed.
// Fetched the way <Sprite> fetches it, so the cached copy is reusable.
// Lives here rather than in the data module, which the pick-stats harvest
// loads under Node, where there is no Image.
export function preloadSprite(pokemon: Pokemon): void {
  for (const { url, cors } of spriteCandidates(pokemon)) {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    img.src = url;
  }
}
