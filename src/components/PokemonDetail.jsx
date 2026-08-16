import { useEffect } from "react";
import { CATEGORIES, CATEGORY_GROUPS } from "../data/categories.js";
import { POKEMON_BY_ID } from "../data/pokedex.js";
import CategoryPill from "./CategoryPill.jsx";
import PokemonName from "./PokemonName.jsx";
import Sprite from "./Sprite.jsx";

// Everything a Pokémon counts for, grouped the way the dropdowns are.
function categoriesOf(pokemon) {
  return CATEGORY_GROUPS.map(([group, label]) => ({
    group,
    label,
    cats: CATEGORIES.filter((c) => c.group === group && c.predicate(pokemon)),
  })).filter((g) => g.cats.length);
}

function PokemonDetail({ pokemon, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const base = pokemon.form ? POKEMON_BY_ID.get(pokemon.species) : null;
  const groups = categoriesOf(pokemon);

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
              {base ? ` · form of ${base.displayName}` : ""}
              {pokemon.evoDetail ? ` · evolves: ${pokemon.evoDetail}` : ""}
              {pokemon.stage === null ? " · no evolution categories" : ""}
            </p>
          </div>
        </div>
        {groups.map((g) => (
          <section key={g.group} className="detail-group">
            <h4>{g.label}</h4>
            <div className="detail-pills">
              {g.cats.map((c) => (
                <CategoryPill key={c.id} cat={c} useShort />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export default PokemonDetail;
