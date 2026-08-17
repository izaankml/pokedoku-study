import { evolutionTree, evoNote, shortHow } from "../logic/evolution.js";
import { POKEMON_BY_ID } from "../data/pokedex.js";
import { formLabel, formTrigger, formsRow, isTransformation, variantNote } from "../logic/forms.js";
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
// the longest word of a name — the tile shrinks the name's font just
// enough for it to fit (App.css .evo-name), so "Meowscarada" never breaks
const longestWord = (name) => Math.max(...name.split(/[\s-]+/).map((w) => w.length));

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

// A stage: sprite, name, how it evolved, and a strip along the bottom in
// its type colours (split for a dual type — the thing that changes along
// a line: Charmander → Charizard gains Flying, Eevee's eight differ).
// `note` (a form's trigger) replaces the evolution method; `form` tiles
// are dashed to read as "becomes, for a while" rather than "evolves into".
// Tapping a tile opens that Pokémon's own sheet (`onOpen`); the current
// one is inert.
function Tile({ pokemon: p, evolved, current, note, form = false, variant = false, onOpen }) {
  const h = note ? { short: note, full: note } : evolved && p.evoDetail ? how(p) : null;
  const [t1, t2 = t1] = p.types;
  const label = p.displayName; // the full PokeDoku name, forms included ("Lycanroc Dusk", "Venusaur Mega")
  const Tag = onOpen && !current ? "button" : "div";
  return (
    <Tag
      type={Tag === "button" ? "button" : undefined}
      className={`evo-tile${current ? " current" : ""}${form ? " form" : ""}${variant ? " variant" : ""}`}
      onClick={Tag === "button" ? () => onOpen(p) : undefined}
      style={{ "--t1": `var(--type-${t1})`, "--t2": `var(--type-${t2})` }}
    >
      <Sprite pokemon={p} className="sprite evo-sprite" />
      <span className="evo-name" style={{ "--len": longestWord(label) }}>
        <PokemonName name={label} />
      </span>
      {h ? (
        <span className="evo-how" title={h.full}>
          {h.short}
        </span>
      ) : null}
      <span className="evo-types" aria-hidden="true" />
    </Tag>
  );
}

// → evolves into · ⇢ becomes, for a while · ⇠ is a form of · ≈ another
// form of the same
const Arrow = ({ glyph = "→" }) => (
  <span className={`evo-arrow${glyph === "→" ? "" : " form"}`} aria-hidden="true">
    {glyph}
  </span>
);

function Node({ node, evolved, focusId, onOpen }) {
  const { pokemon, children } = node;
  const tile = <Tile pokemon={pokemon} evolved={evolved} current={pokemon.id === focusId} onOpen={onOpen} />;
  if (!children.length) return tile;
  if (children.length === 1) {
    return (
      <div className="evo-node">
        {tile}
        <Arrow />
        <Node node={children[0]} evolved focusId={focusId} onOpen={onOpen} />
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
                  <Tile key={c.pokemon.id} pokemon={c.pokemon} evolved current={c.pokemon.id === focusId} onOpen={onOpen} />
                ))}
              </div>
            ))}
          </div>
        ) : null}
        {chains.map((c) => (
          <Node key={c.pokemon.id} node={c} evolved focusId={focusId} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

function EvolutionLine({ pokemon, onOpen }) {
  const tree = evolutionTree(pokemon);
  if (!tree) return <p className="evo-none">Doesn&apos;t evolve</p>;
  return (
    <div className="evo-scroll">
      <div className="evo-line">
        <Node node={tree.root} evolved={false} focusId={tree.focusId} onOpen={onOpen} />
      </div>
    </div>
  );
}

// The Forms row: the Pokémon and the forms that relate to it directly
// (forms.js formsRow), one flat wrapping row in dex order, the Pokémon
// itself highlighted. Null when there's nothing.
export function FormsRows({ pokemon, onOpen }) {
  const list = formsRow(pokemon);
  if (!list.length) return null;
  return (
    <>
      <h4 className="detail-forms-head">Forms</h4>
      <div className="forms-row">
        {list.map((p) => {
          const transformation = isTransformation(p);
          const variant = !transformation && p.id !== (POKEMON_BY_ID.get(p.species) || p).id;
          return (
            <Tile
              key={p.id}
              pokemon={p}
              form={transformation}
              variant={variant}
              note={transformation ? formTrigger(p) : variant && variantNote(p) && variantNote(p) !== formLabel(p) ? variantNote(p) : null}
              current={p.id === pokemon.id}
              onOpen={onOpen}
            />
          );
        })}
      </div>
    </>
  );
}

export default EvolutionLine;
