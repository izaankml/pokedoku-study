import { ABILITIES } from "../data/traits.js";

// Types carry their canonical colour, regions the colours of their games,
// groups (Legendary, Fossil, …) a tint each, and every other family
// (evolution method, stage, line, type count, moves) one tint per family
// (see App.css).
function CategoryPill({ cat, useShort = false }) {
  let extra = "";
  if (cat.group === "type") extra = ` type-${cat.id.slice(5)}`;
  else if (cat.group === "region") extra = ` region-${cat.id.slice(7)}`;
  else if (cat.group === "special") extra = ` group-${cat.id.slice(5)}`;
  else extra = ` cat-${cat.group}`;
  return <span className={`pill${extra}`}>{useShort ? cat.short : cat.label}</span>;
}

const TRACKED = new Set(ABILITIES.map((a) => a.name));

// One of a Pokémon's abilities (`{ name, hidden }`). The few abilities
// PokeDoku actually asks about are tinted so they stand out from the rest.
export function AbilityPill({ ability }) {
  const cls = `pill ability${TRACKED.has(ability.name) ? " tracked" : ""}${ability.hidden ? " hidden" : ""}`;
  return (
    <span className={cls}>
      {ability.name}
      {ability.hidden ? <span className="pill-note">hidden</span> : null}
    </span>
  );
}

export default CategoryPill;
