import { Fragment } from "react";
import { evolutionTree, evoNote, shortHow } from "../logic/evolution.js";
import { baseOf, formLabel, formTrigger, formsOf } from "../logic/forms.js";
import PokemonName from "./PokemonName.jsx";
import Sprite from "./Sprite.jsx";

// A Pokémon's whole evolution line as a tree of square tiles — sprite,
// name and (for evolved forms) how it evolved — the Pokémon in question
// highlighted. Each tile is joined by an arrow to its own evolutions:
// one arrow to a lone evolution, one shared arrow into a column when it
// branches. Within a branch, evolutions that go no further pack into
// vertical columns — one per generation when three or more span several
// (Eevee: the Kanto three, the Johto two, the Sinnoh two, Sylveon), else
// pairs;
// the tree never wraps — it shrinks to fit the sheet, then scrolls —
// and ones that evolve again get a row each, so Goomy shows Sliggoo →
// Goodra over Hisuian Sliggoo → Hisuian Goodra, and Applin has Flapple
// and Appletun paired above Dipplin → Hydrapple. A lone tile sits centred
// against whatever it's joined to.
function how(p) {
  const note = evoNote(p);
  return {
    short: shortHow(p.evoDetail) + (note ? `, ${note}` : ""),
    full: p.evoDetail + (note ? `, ${note}` : ""),
  };
}

const pairsOf = (list) => list.reduce((acc, p, i) => (i % 2 ? acc[acc.length - 1].push(p) : acc.push([p]), acc), []);
function columnsOf(leaves) {
  const gens = [...new Set(leaves.map((c) => c.pokemon.gen))];
  // two always stack (Typhlosion over Hisuian Typhlosion, whatever their gens)
  return leaves.length > 2 && gens.length > 1 ? gens.map((g) => leaves.filter((c) => c.pokemon.gen === g)) : pairsOf(leaves);
}

// `note` (a form's trigger) replaces the evolution method; `form` tiles
// are dashed to read as "becomes, for a while" rather than "evolves into",
// and name just the form ("Mega X") since the base sits beside them
function Tile({ pokemon: p, evolved, current, note, form = false }) {
  const h = note ? { short: note, full: note } : evolved && p.evoDetail ? how(p) : null;
  return (
    <div className={`evo-tile${current ? " current" : ""}${form ? " form" : ""}`} title={form ? p.displayName : undefined}>
      <Sprite pokemon={p} className="sprite evo-sprite" />
      <span className="evo-name">
        <PokemonName name={form ? formLabel(p) : p.displayName} />
      </span>
      {h ? (
        <span className="evo-how" title={h.full}>
          {h.short}
        </span>
      ) : null}
    </div>
  );
}

const Arrow = ({ form = false }) => (
  <span className={`evo-arrow${form ? " form" : ""}`} aria-hidden="true">
    {form ? "⇢" : "→"}
  </span>
);

function Node({ node, evolved, focusId }) {
  const { pokemon, children } = node;
  const tile = <Tile pokemon={pokemon} evolved={evolved} current={pokemon.id === focusId} />;
  if (!children.length) return tile;
  if (children.length === 1) {
    return (
      <div className="evo-node">
        {tile}
        <Arrow />
        <Node node={children[0]} evolved focusId={focusId} />
      </div>
    );
  }
  const leaves = children.filter((c) => !c.children.length);
  const chains = children.filter((c) => c.children.length);
  return (
    <div className="evo-node">
      {tile}
      <Arrow />
      <div className="evo-branch">
        {leaves.length ? (
          <div className="evo-tiles">
            {columnsOf(leaves).map((col) => (
              <div key={col[0].pokemon.id} className="evo-col">
                {col.map((c) => (
                  <Tile key={c.pokemon.id} pokemon={c.pokemon} evolved current={c.pokemon.id === focusId} />
                ))}
              </div>
            ))}
          </div>
        ) : null}
        {chains.map((c) => (
          <Node key={c.pokemon.id} node={c} evolved focusId={focusId} />
        ))}
      </div>
    </div>
  );
}

function EvolutionLine({ pokemon }) {
  const tree = evolutionTree(pokemon);
  if (!tree) return <p className="evo-none">Doesn&apos;t evolve</p>;
  return (
    <div className="evo-scroll">
      <div className="evo-line">
        <Node node={tree.root} evolved={false} focusId={tree.focusId} />
      </div>
    </div>
  );
}

// The transformations (forms.js) of every stage of a Pokémon's line —
// Charizard ⇢ Mega X / Mega Y / Gigantamax — one row per stage that has
// any, the Pokémon itself highlighted when it is one of them. Null when
// the line has none.
export function FormsRows({ pokemon }) {
  const tree = evolutionTree(pokemon);
  const stages = [];
  const walk = (n) => {
    stages.push(n.pokemon);
    n.children.forEach(walk);
  };
  if (tree) walk(tree.root);
  else stages.push(baseOf(pokemon));
  const rows = stages.map((s) => [s, formsOf(s)]).filter(([, forms]) => forms.length);
  if (!rows.length) return null;
  return (
    <>
      <h4 className="detail-forms-head">Forms</h4>
      <div className="evo-scroll">
        {/* one grid, so the bases line up when several stages have forms */}
        <div className="forms-grid">
          {rows.map(([stage, forms]) => (
            <Fragment key={stage.id}>
              <Tile pokemon={stage} />
              <Arrow form />
              <div className="evo-tiles">
                {forms.map((f) => (
                  <Tile key={f.id} pokemon={f} form note={formTrigger(f)} current={f.id === pokemon.id} />
                ))}
              </div>
            </Fragment>
          ))}
        </div>
      </div>
    </>
  );
}

export default EvolutionLine;
