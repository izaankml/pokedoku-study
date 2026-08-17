import { useEffect } from "react";
import { CATEGORIES, CATEGORY_GROUPS } from "../data/categories.js";
import { POKEMON_BY_ID } from "../data/pokedex.js";
import CategoryPill, { AbilityPill } from "./CategoryPill.jsx";
import PokemonName from "./PokemonName.jsx";
import Sprite from "./Sprite.jsx";

// Everything a Pokémon counts for, grouped the way the dropdowns are —
// minus type count (the type pills already show it) and the tracked
// abilities (the full ability list below covers them). Small groups sit
// two abreast so the sheet rarely needs scrolling; Moves take a full row.
const DETAIL_LABELS = { type: "Type", region: "Region", special: "Group" };
const SKIP = new Set(["typeCount", "ability"]);
const WIDE = new Set(["move"]);
function categoriesOf(pokemon) {
  return CATEGORY_GROUPS.filter(([group]) => !SKIP.has(group))
    .map(([group, label]) => ({
      group,
      label: DETAIL_LABELS[group] || label,
      wide: WIDE.has(group),
      cats: CATEGORIES.filter((c) => c.group === group && c.predicate(pokemon)),
    }))
    .filter((g) => g.cats.length);
}

function PokemonDetail({ pokemon, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    // #root is the page's scroller (see App.css); freeze it while open
    const root = document.getElementById("root");
    const prev = root ? root.style.overflow : "";
    if (root) root.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      if (root) root.style.overflow = prev;
    };
  }, [onClose]);

  const base = pokemon.form ? POKEMON_BY_ID.get(pokemon.species) : null;
  const groups = categoriesOf(pokemon);
  const narrow = groups.filter((g) => !g.wide);
  const renderGroup = (g) => (
    <section key={g.group} className={`detail-group${g.wide ? " wide" : ""}`}>
      <h4>{g.label}</h4>
      <div className="detail-pills">
        {g.cats.map((c) => (
          <CategoryPill key={c.id} cat={c} useShort />
        ))}
      </div>
    </section>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pokemon-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <div className="detail-head">
          <Sprite pokemon={pokemon} className="sprite detail-sprite" />
          <div>
            <h3 id="pokemon-detail-title">
              <PokemonName name={pokemon.displayName} />
            </h3>
            <p className="hint detail-meta">
              #{String(pokemon.species).padStart(4, "0")}
              {base ? ` · Form of ${base.displayName}` : ""}
              {pokemon.evoDetail ? ` · Evolves: ${pokemon.evoDetail}` : ""}
            </p>
          </div>
        </div>
        <div className="detail-grid">
          {/* an odd narrow group would sit alone on the left; let it span and centre */}
          {narrow.map((g, i) => renderGroup(i === narrow.length - 1 && narrow.length % 2 ? { ...g, wide: true } : g))}
          <section className="detail-group wide">
            <h4>Abilities</h4>
            <div className="detail-pills">
              {pokemon.abilityList.map((a) => (
                <AbilityPill key={a.name} ability={a} />
              ))}
            </div>
          </section>
          {groups.filter((g) => g.wide).map(renderGroup)}
        </div>
      </div>
    </div>
  );
}

export default PokemonDetail;
