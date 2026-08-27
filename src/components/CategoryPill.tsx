import type { SVGProps } from "react";
import { pillClassOf } from "../data/categories.ts";
import type { Category } from "../data/categories.ts";
import { ABILITIES } from "../data/traits.ts";
import { TYPE_ICON_PATHS } from "../data/typeIcons.ts";
import type { AbilitySlot, PokemonType } from "../data/types.ts";

interface TypeIconProps extends SVGProps<SVGSVGElement> {
  type: string;
}

const isPokemonType = (type: string): type is PokemonType => type in TYPE_ICON_PATHS;

// The type's in-game symbol, drawn in the current text colour.
export function TypeIcon({ type, ...props }: TypeIconProps) {
  if (!isPokemonType(type)) return null;
  return (
    <svg className="type-icon" viewBox="0 0 512 512" aria-hidden="true" {...props}>
      <path d={TYPE_ICON_PATHS[type]} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

// What a pill needs to know about its category: the id tells the colour
// family (type-fire, region-galar, flag-legendary), the group the tint.
export type PillCategory = Pick<Category, "id" | "label" | "short" | "group">;

interface CategoryPillProps {
  cat: PillCategory;
  useShort?: boolean;
  // when given, the pill is a button (a clicked pill jumps to Browse)
  onSelect?: () => void;
}

// Types carry their canonical colour and symbol, regions the colours of their games,
// groups (Legendary, Fossil, …) a tint each, and every other family
// (evolution method, stage, line, type count, moves) one tint per family
// (see App.css).
function CategoryPill({ cat, useShort = false, onSelect }: CategoryPillProps) {
  const extra = pillClassOf(cat);
  const icon = cat.group === "type" ? <TypeIcon type={cat.id.slice(5)} /> : null;
  const content = (
    <>
      {icon}
      {useShort ? cat.short : cat.label}
    </>
  );
  if (onSelect) {
    return (
      <button type="button" className={`pill pill-link${extra}`} title={`Browse ${cat.label}`} onClick={onSelect}>
        {content}
      </button>
    );
  }
  return <span className={`pill${extra}`}>{content}</span>;
}

const TRACKED = new Set(ABILITIES.map((ability) => ability.name));

interface AbilityPillProps {
  ability: AbilitySlot;
}

// One of a Pokémon's abilities. The few abilities PokeDoku actually asks
// about are tinted so they stand out from the rest.
export function AbilityPill({ ability }: AbilityPillProps) {
  const className = `pill ability${TRACKED.has(ability.name) ? " tracked" : ""}${ability.hidden ? " hidden" : ""}`;
  return (
    <span className={className}>
      {ability.name}
      {ability.hidden ? <span className="pill-note">hidden</span> : null}
    </span>
  );
}

export default CategoryPill;
