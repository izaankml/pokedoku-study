import { useEffect } from "react";
import { CATEGORIES, CATEGORY_GROUPS } from "../data/categories.js";
import { POKEMON_BY_ID } from "../data/pokedex.js";
import CategoryPill, { AbilityPill } from "./CategoryPill.jsx";
import PokemonName from "./PokemonName.jsx";
import Sprite from "./Sprite.jsx";
import EvolutionLine from "./EvolutionLine.jsx";

// The sheet is three blocks: identity (sprite, name, dex line, types),
// then a label/value list of everything else the Pokémon counts for, then
// its evolution line. Types sit in the header rather than the list — they
// are what you recognise a Pokémon by. Dropped from the list (still
// categories everywhere else): type count (two type pills already say
// "dual"), the tracked abilities (the full ability row covers them) and
// evolution stage and line (the evolution tree below shows both).
const FACT_LABELS = { region: "Region", special: "Group", move: "Moves" };
const SKIP = new Set(["type", "typeCount", "ability", "stage", "evoLine"]);
function factsOf(pokemon) {
  return CATEGORY_GROUPS.filter(([group]) => !SKIP.has(group))
    .map(([group, label]) => ({
      group,
      label: FACT_LABELS[group] || label,
      cats: CATEGORIES.filter((c) => c.group === group && c.predicate(pokemon)),
    }))
    .filter((g) => g.cats.length);
}

// `wide` rows (Moves) drop their pills below the label on narrow screens
function Fact({ label, wide = false, children }) {
  return (
    <div className={`fact${wide ? " wide" : ""}`}>
      <dt>{label}</dt>
      <dd className="detail-pills">{children}</dd>
    </div>
  );
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
  const types = CATEGORIES.filter((c) => c.group === "type" && c.predicate(pokemon));
  const facts = factsOf(pokemon);
  // abilities go after the category rows but before the (long) move row
  const before = facts.filter((f) => f.group !== "move");
  const moves = facts.filter((f) => f.group === "move");
  const renderFact = (f) => (
    <Fact key={f.group} label={f.label} wide={f.group === "move"}>
      {f.cats.map((c) => (
        <CategoryPill key={c.id} cat={c} useShort />
      ))}
    </Fact>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal detail"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pokemon-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <header className="detail-head">
          <div className={`detail-well type-${pokemon.types[0]}`}>
            <Sprite pokemon={pokemon} className="sprite detail-sprite" />
          </div>
          <div className="detail-title">
            <h3 id="pokemon-detail-title">
              <PokemonName name={pokemon.displayName} />
            </h3>
            <p className="detail-meta">
              #{String(pokemon.species).padStart(4, "0")}
              {base ? ` · Form of ${base.displayName}` : ""}
            </p>
            <div className="detail-types">
              {types.map((c) => (
                <CategoryPill key={c.id} cat={c} useShort />
              ))}
            </div>
          </div>
        </header>
        <dl className="detail-facts">
          {before.map(renderFact)}
          <Fact label="Abilities">
            {pokemon.abilityList.map((a) => (
              <AbilityPill key={a.name} ability={a} />
            ))}
          </Fact>
          {moves.map(renderFact)}
        </dl>
        <section className="detail-evo">
          <h4>Evolution</h4>
          <EvolutionLine pokemon={pokemon} />
        </section>
      </div>
    </div>
  );
}

export default PokemonDetail;
