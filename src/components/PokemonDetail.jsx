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

  // Types sit under the name with the groups beside them. When that row
  // can't hold both (Koraidon on a phone) it drops under the sprite and
  // spans the header (App.css .types-below); a name long enough to push the
  // region pill down breaks over two lines with the pill beside them
  // (.name-wraps)
  const headRef = useRef(null);
  useLayoutEffect(() => {
    const head = headRef.current;
    if (!head) return undefined;
    const overflows = () => head.scrollWidth > head.clientWidth + 1;
    const place = () => {
      head.classList.remove("types-below", "name-wraps"); // measure with the tags under the name
      const tags = head.querySelector(".detail-tags");
      const pill = tags?.querySelector(".pill");
      const wrapped = pill && tags.offsetHeight > pill.offsetHeight * 1.5; // types and groups no longer share a line
      if (wrapped || overflows()) head.classList.add("types-below");
      // a long name that would push the region pill onto its own line: the
      // name breaks over two lines instead, the pill centred beside them
      const row = head.querySelector(".detail-name-row");
      const h3 = row?.querySelector("h3");
      if (h3) h3.style.width = "";
      const pushed = h3 && row.offsetHeight > h3.offsetHeight * 1.5;
      if (pushed || overflows()) {
        head.classList.add("name-wraps");
        // the wrapped heading would still claim the row's full width; trim
        // it to its widest line so the pill hugs the text
        const range = document.createRange();
        range.selectNodeContents(h3);
        const widest = Math.max(0, ...[...range.getClientRects()].map((r) => r.width));
        if (widest) h3.style.width = `${Math.ceil(widest) + 6}px`; // slack: a hair short re-wraps it to three lines
      }
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
            {base ? ` · Form of ${pokemon.speciesName || base.displayName}` : ""}
          </p>
          <div className="detail-name-row">
            <h3 id="pokemon-detail-title">
              <PokemonName name={pokemon.displayName} />
            </h3>
            <div className="detail-pills detail-region">
              {regions.map((c) => (
                <CategoryPill key={c.id} cat={c} useShort />
              ))}
            </div>
          </div>
          {/* types then groups, one wrapping row; under the sprite when
              that's the only way they fit (Koraidon on a phone) */}
          <div className="detail-tags">
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
