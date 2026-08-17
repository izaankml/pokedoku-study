import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CATEGORIES, CATEGORY_GROUPS } from "../data/categories.js";
import { POKEMON_BY_ID } from "../data/pokedex.js";
import CategoryPill, { AbilityPill } from "./CategoryPill.jsx";
import PokemonName from "./PokemonName.jsx";
import Sprite from "./Sprite.jsx";
import EvolutionLine, { FormsRows } from "./EvolutionLine.jsx";
import { useFitRows } from "./useFitRows.js";

// The sheet is three blocks: identity (sprite; dex line, then the name
// with the region pill beside it, then the type pills with the group
// pills beside them — region and groups in one column), then the evolution
// tree, then a label/value list of
// everything else the Pokémon counts for. Types and region sit in the
// header — they are what you recognise a Pokémon by. Dropped from the
// list (still categories everywhere else): type count (two type pills
// already say "dual"), the tracked abilities (the full ability row covers
// them), and evolution method, stage and line (the tree shows all three).
const FACT_LABELS = { move: "Moves" };
const SKIP = new Set(["type", "region", "special", "typeCount", "ability", "evo", "stage", "evoLine"]);
function factsOf(pokemon) {
  return CATEGORY_GROUPS.filter(([group]) => !SKIP.has(group))
    .map(([group, label]) => ({
      group,
      label: FACT_LABELS[group] || label,
      cats: CATEGORIES.filter((c) => c.group === group && c.predicate(pokemon)),
    }))
    .filter((g) => g.cats.length);
}

function Fact({ label, children }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd className="detail-pills">{children}</dd>
    </div>
  );
}

// `onOpen(pokemon)` opens another Pokémon's sheet (a tile of the tree)
function PokemonDetail({ pokemon, onClose, onOpen }) {
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

  const evoRef = useRef(null);
  useFitRows(evoRef, [pokemon]); // the tree and forms sized together to fit the sheet

  // Types sit under the name; when that row plus the region/groups column
  // is wider than the header (Koraidon on a phone), the types drop under
  // the sprite instead (App.css .types-below)
  // A fade with a chevron pinned to the sheet's bottom edge while there's
  // more below to scroll to
  const modalRef = useRef(null);
  const [more, setMore] = useState(false);
  useLayoutEffect(() => {
    const el = modalRef.current;
    if (!el) return undefined;
    const check = () => setMore(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    for (const child of el.children) ro.observe(child);
    return () => {
      el.removeEventListener("scroll", check);
      ro.disconnect();
    };
  }, [pokemon]);

  const headRef = useRef(null);
  useLayoutEffect(() => {
    const head = headRef.current;
    if (!head) return undefined;
    const place = () => {
      head.classList.remove("types-below"); // measure with the types under the name
      const groups = head.querySelector(".detail-groups");
      const pill = groups?.firstElementChild;
      const stacked = pill && groups.offsetHeight > pill.offsetHeight * 1.5; // the groups had to wrap
      if (stacked || head.scrollWidth > head.clientWidth + 1) head.classList.add("types-below");
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(head);
    return () => ro.disconnect();
  }, [pokemon]);

  const base = pokemon.form ? POKEMON_BY_ID.get(pokemon.species) : null;
  const of = (group) => CATEGORIES.filter((c) => c.group === group && c.predicate(pokemon));
  const types = of("type");
  const regions = of("region");
  const groups = of("special");
  const facts = factsOf(pokemon);
  // abilities go after the category rows but before the (long) move row
  const before = facts.filter((f) => f.group !== "move");
  const moves = facts.filter((f) => f.group === "move");
  const renderFact = (f) => (
    <Fact key={f.group} label={f.label}>
      {f.cats.map((c) => (
        <CategoryPill key={c.id} cat={c} useShort />
      ))}
    </Fact>
  );

  // Rendered on <body>: the tab roots animate a translate on entry, and a
  // transforming ancestor would anchor the fixed backdrop to itself — a
  // sheet opened by a reload would sit far down the page until the
  // animation ended, then jump.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal detail"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pokemon-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <header className="detail-head" ref={headRef}>
          <Sprite pokemon={pokemon} className="sprite detail-sprite" />
          <p className="detail-meta">
            #{String(pokemon.species).padStart(4, "0")}
            {base ? ` · Form of ${base.displayName}` : ""}
          </p>
          <h3 id="pokemon-detail-title">
            <PokemonName name={pokemon.displayName} />
          </h3>
          <div className="detail-pills detail-region">
            {regions.map((c) => (
              <CategoryPill key={c.id} cat={c} useShort />
            ))}
          </div>
          <div className="detail-pills detail-types">
            {types.map((c) => (
              <CategoryPill key={c.id} cat={c} useShort />
            ))}
          </div>
          <div className="detail-pills detail-groups">
            {groups.map((c) => (
              <CategoryPill key={c.id} cat={c} useShort />
            ))}
          </div>
        </header>
        <section className="detail-evo" ref={evoRef}>
          <h4>Evolution</h4>
          <EvolutionLine pokemon={pokemon} onOpen={onOpen} />
          <FormsRows pokemon={pokemon} onOpen={onOpen} />
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
        <div className={`modal-more${more ? " on" : ""}`} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default PokemonDetail;
