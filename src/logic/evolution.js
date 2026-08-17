// Evolution lines, drawn from each record's `prevo` (the record it evolved
// from). A line is a list of levels — [[Eevee], [Vaporeon, Jolteon, …]] —
// walked from the root of whatever line the Pokémon belongs to. Mega and
// Gigantamax forms have no evolution of their own, so they show their base
// species' line.

import { POKEMON, POKEMON_BY_ID } from "../data/pokedex.js";

const childrenOf = new Map();
for (const p of POKEMON) {
  if (p.prevo === null || p.prevo === undefined) continue;
  if (!childrenOf.has(p.prevo)) childrenOf.set(p.prevo, []);
  childrenOf.get(p.prevo).push(p);
}
for (const kids of childrenOf.values()) kids.sort((a, b) => a.id - b.id);

// { levels, focusId } — levels are arrays of records, root first; focusId
// is the record to highlight (the Pokémon itself, or its base species for
// Mega/Gigantamax). Null when the Pokémon doesn't evolve at all.
export function evolutionLine(pokemon) {
  let focus = pokemon;
  if (focus.stage === null && focus.species !== focus.id) focus = POKEMON_BY_ID.get(focus.species) || focus;
  let root = focus;
  const seen = new Set([root.id]);
  while (root.prevo !== null && root.prevo !== undefined && POKEMON_BY_ID.has(root.prevo) && !seen.has(root.prevo)) {
    root = POKEMON_BY_ID.get(root.prevo);
    seen.add(root.id);
  }
  const levels = [[root]];
  let frontier = [root];
  while (frontier.length) {
    const next = frontier.flatMap((p) => childrenOf.get(p.id) || []);
    if (!next.length) break;
    levels.push(next);
    frontier = next;
  }
  if (levels.length === 1 && levels[0].length === 1) return null;
  return { levels, focusId: focus.id };
}

// The chip has room for a phrase, not a sentence: "Use a Water Stone" →
// "Water Stone", "Level 16 during the day" → "Lv 16, day", "Trade holding
// a Metal Coat" → "Trade + Metal Coat", "Use a Leaf Stone, or level up near
// a Moss Rock" → "Leaf Stone / Moss Rock". The full text stays in the title.
export function shortHow(detail) {
  return detail
    .replace(/^Use an? /, "")
    .replace(/, or use an? /, " / ")
    .replace(/, or level up near an? /, " / ")
    .replace(/, or level up at /, " / ")
    .replace(/, or level up /, " / ")
    .replace(/^Level up holding an? /, "Holding ")
    .replace(/^Level up knowing /, "Knowing ")
    .replace(/^Level up with /, "With ")
    .replace(/^Level up in a special magnetic field/, "Magnetic field")
    .replace(/ in a special magnetic field/, " / magnetic field")
    .replace(/^Level up /, "Lv-up ")
    .replace(/^Level (\d+)/, "Lv $1")
    .replace(/^Trade holding an? /, "Trade + ")
    .replace(/^Trade, or use a Linking Cord$/, "Trade / Linking Cord")
    .replace(/^High friendship while knowing a Fairy-type move$/, "Friendship + Fairy move")
    .replace(/^High friendship/, "Friendship")
    .replace(/^Walk (\d+) steps in Let's Go$/, "$1 steps (Let's Go)")
    .replace(/ during the day$/, ", day")
    .replace(/ at night$/, ", night")
    .replace(/ during rain$/, ", rain")
    .replace(/Mount Lanakila/, "Mt. Lanakila");
}
