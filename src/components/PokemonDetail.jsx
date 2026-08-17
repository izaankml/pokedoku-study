import { useEffect } from "react";
import { CATEGORIES, CATEGORY_GROUPS } from "../data/categories.js";
import { POKEMON_BY_ID } from "../data/pokedex.js";
import CategoryPill, { AbilityPill } from "./CategoryPill.jsx";
import PokemonName from "./PokemonName.jsx";
import Sprite from "./Sprite.jsx";
import EvolutionLine from "./EvolutionLine.jsx";

// The sheet is three blocks: identity (sprite, name, dex line, type and
// region pills), then the evolution tree, then a label/value list of
// everything else the Pokémon counts for. Types and region sit in the
// header — they are what you recognise a Pokémon by. Dropped from the
// list (still categories everywhere else): type count (two type pills
// already say "dual"), the tracked abilities (the full ability row covers
// them), and evolution method, stage and line (the tree shows all three).
const FACT_LABELS = { special: "Group", move: "Moves" };
const SKIP = new Set(["type", "region", "typeCount", "ability", "evo", "stage", "evoLine"]);
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
  const identity = CATEGORIES.filter((c) => (c.group === "type" || c.group === "region") && c.predicate(pokemon));
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
          <Sprite pokemon={pokemon} className="sprite detail-sprite" />
          <div className="detail-title">
            <h3 id="pokemon-detail-title">
              <PokemonName name={pokemon.displayName} />
            </h3>
            <p className="detail-meta">
              #{String(pokemon.species).padStart(4, "0")}
              {base ? ` · Form of ${base.displayName}` : ""}
            </p>
            <div className="detail-types">
              {identity.map((c) => (
                <CategoryPill key={c.id} cat={c} useShort />
              ))}
            </div>
          </div>
        </header>
        <section className="detail-evo">
          <h4>Evolution</h4>
          <EvolutionLine pokemon={pokemon} />
        </section>
        <dl className="detail-facts">
          {before.map(renderFact)}
          <Fact label="Abilities">
            {pokemon.abilityList.map((a) => (
              <AbilityPill key={a.name} ability={a} />
            ))}
          </Fact>
          {moves.map(renderFact)}
        </dl>
      </div>
    </div>
  );
}

export default PokemonDetail;
