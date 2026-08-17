import { ABILITIES } from "../data/traits.js";
import { TYPE_ICON_PATHS } from "../data/typeIcons.js";

// The type's in-game symbol, drawn in the current text colour.
export function TypeIcon({ type, ...props }) {
  const d = TYPE_ICON_PATHS[type];
  if (!d) return null;
  return (
    <svg className="type-icon" viewBox="0 0 512 512" aria-hidden="true" {...props}>
      <path d={d} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

// Types carry their canonical colour and symbol, regions the colours of their games,
// groups (Legendary, Fossil, …) a tint each, and every other family
// (evolution method, stage, line, type count, moves) one tint per family
// (see App.css).
function CategoryPill({ cat, useShort = false }) {
  let extra = "";
  let icon = null;
  if (cat.group === "type") {
    const type = cat.id.slice(5);
    extra = ` type-${type}`;
    icon = <TypeIcon type={type} />;
  } else if (cat.group === "region") extra = ` region-${cat.id.slice(7)}`;
  else if (cat.group === "special") extra = ` group-${cat.id.slice(5)}`;
  else extra = ` cat-${cat.group}`;
  return (
    <span className={`pill${extra}`}>
      {icon}
      {useShort ? cat.short : cat.label}
    </span>
  );
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
