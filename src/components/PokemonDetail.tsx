import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { CATEGORIES, CATEGORY_GROUPS, getCategory } from "../data/categories.ts";
import type { Category, CategoryGroup } from "../data/categories.ts";
import { POKEMON_BY_ID } from "../data/pokedex.ts";
import type { Pokemon } from "../data/types.ts";
import CategoryPill, { AbilityPill } from "./CategoryPill.tsx";
import { jumpToBrowse } from "../logic/hashState.ts";
import PokemonName from "./PokemonName.tsx";
import Sprite from "./Sprite.tsx";
import EvolutionLine, { FormsRows } from "./EvolutionLine.tsx";
import { useFitRows } from "./useFitRows.ts";
import { useModalShell } from "./useModalShell.ts";

// The sheet is three blocks: identity (sprite; dex line, then the name
// with the region pill beside it, then the type pills with the group
// pills beside them — region and groups in one column), then the evolution
// tree, then a label/value list of
// everything else the Pokémon counts for. Types and region sit in the
// header — they are what you recognise a Pokémon by. Dropped from the
// list (still categories everywhere else): type count (two type pills
// already say "dual"), the tracked abilities (the full ability row covers
// them), and evolution method, stage and line (the tree shows all three).
const FACT_LABELS: Partial<Record<CategoryGroup, string>> = { move: "Moves" };
const SKIP = new Set<CategoryGroup>(["type", "region", "special", "typeCount", "ability", "evo", "stage", "evoLine"]);

interface FactGroup {
  group: CategoryGroup;
  label: string;
  cats: Category[];
}

function factsOf(pokemon: Pokemon): FactGroup[] {
  return CATEGORY_GROUPS.filter(([group]) => !SKIP.has(group))
    .map(([group, label]) => ({
      group,
      label: FACT_LABELS[group] || label,
      cats: CATEGORIES.filter((category) => category.group === group && category.predicate(pokemon)),
    }))
    .filter((fact) => fact.cats.length);
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd className="detail-pills">{children}</dd>
    </div>
  );
}

interface PokemonDetailProps {
  pokemon: Pokemon;
  onClose: () => void;
  // opens another Pokémon's sheet (a tile of the tree)
  onOpen: (pokemon: Pokemon) => void;
}

function PokemonDetail({ pokemon, onClose, onOpen }: PokemonDetailProps) {
  useModalShell(onClose);

  const evoRef = useRef<HTMLElement | null>(null);
  useFitRows(evoRef, [pokemon]); // the tree and forms sized together to fit the sheet

  // A fade with a chevron pinned to the sheet's bottom edge while there's
  // more below to scroll to
  const modalRef = useRef<HTMLDivElement | null>(null);
  const [more, setMore] = useState(false);
  useLayoutEffect(() => {
    const modal = modalRef.current;
    if (!modal) return undefined;
    const check = () => setMore(modal.scrollTop + modal.clientHeight < modal.scrollHeight - 4);
    check();
    modal.addEventListener("scroll", check, { passive: true });
    const observer = new ResizeObserver(check);
    observer.observe(modal);
    for (const child of modal.children) observer.observe(child);
    return () => {
      modal.removeEventListener("scroll", check);
      observer.disconnect();
    };
  }, [pokemon]);

  // Types sit under the name with the groups beside them. When that row
  // can't hold both (Koraidon on a phone) it drops under the sprite and
  // spans the header (App.css .types-below); a name long enough to push the
  // region pill down breaks over two lines with the pill beside them
  // (.name-wraps)
  const headRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const head = headRef.current;
    if (!head) return undefined;
    const overflows = () => head.scrollWidth > head.clientWidth + 1;
    const place = () => {
      head.classList.remove("types-below", "name-wraps"); // measure with the tags under the name
      const tags = head.querySelector<HTMLElement>(".detail-tags");
      const pill = tags?.querySelector<HTMLElement>(".pill");
      const wrapped = tags && pill && tags.offsetHeight > pill.offsetHeight * 1.5; // types and groups no longer share a line
      if (wrapped || overflows()) head.classList.add("types-below");
      // a long name that would push the region pill onto its own line: the
      // name breaks over two lines instead, the pill centred beside them
      const row = head.querySelector<HTMLElement>(".detail-name-row");
      const heading = row?.querySelector<HTMLElement>("h3");
      if (heading) heading.style.width = "";
      const pushed = row && heading && row.offsetHeight > heading.offsetHeight * 1.5;
      if (pushed || overflows()) {
        head.classList.add("name-wraps");
        // the wrapped heading would still claim the row's full width; trim
        // it to its widest line so the pill hugs the text
        if (heading) {
          const range = document.createRange();
          range.selectNodeContents(heading);
          const widest = Math.max(0, ...[...range.getClientRects()].map((rect) => rect.width));
          if (widest) heading.style.width = `${Math.ceil(widest) + 6}px`; // slack: a hair short re-wraps it to three lines
        }
      }
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(head);
    return () => observer.disconnect();
  }, [pokemon]);

  const base = pokemon.form ? POKEMON_BY_ID.get(pokemon.species) : null;
  const of = (group: CategoryGroup): Category[] =>
    CATEGORIES.filter((category) => category.group === group && category.predicate(pokemon));
  // in the Pokémon's own order (Ghost/Poison for Gengar), as everywhere else
  const types = pokemon.types.map((type) => getCategory(`type-${type}`));
  const regions = of("region");
  const groups = of("special");
  const facts = factsOf(pokemon);
  // abilities go after the category rows but before the (long) move row
  const before = facts.filter((fact) => fact.group !== "move");
  const moves = facts.filter((fact) => fact.group === "move");
  // every pill jumps to Browse filtered to it — a type pill takes the
  // whole typing along (a dual type browses both)
  const renderFact = (fact: FactGroup) => (
    <Fact key={fact.group} label={fact.label}>
      {fact.cats.map((category) => (
        <CategoryPill key={category.id} cat={category} useShort onSelect={() => jumpToBrowse([category.id])} />
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
        onClick={(event) => event.stopPropagation()}
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
              {regions.map((category) => (
                <CategoryPill key={category.id} cat={category} useShort onSelect={() => jumpToBrowse([category.id])} />
              ))}
            </div>
          </div>
          {/* types then groups, one wrapping row; under the sprite when
              that's the only way they fit (Koraidon on a phone) */}
          <div className="detail-tags">
            <div className="detail-pills detail-types">
              {types.map((category) => (
                <CategoryPill
                  key={category.id}
                  cat={category}
                  useShort
                  onSelect={() => jumpToBrowse(types.map((type) => type.id))}
                />
              ))}
            </div>
            <div className="detail-pills detail-groups">
              {groups.map((category) => (
                <CategoryPill key={category.id} cat={category} useShort onSelect={() => jumpToBrowse([category.id])} />
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
            {pokemon.abilityList.map((ability) => (
              <AbilityPill key={ability.name} ability={ability} />
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
