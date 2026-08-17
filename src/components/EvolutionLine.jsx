import { evolutionTree, evoNote, shortHow } from "../logic/evolution.js";
import { POKEMON_BY_ID } from "../data/pokedex.js";
import { baseNote, formLabel, formTrigger, formsOf, variantNote, variantsOf } from "../logic/forms.js";
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
// are dashed to read as "becomes, for a while" rather than "evolves into",
// and name just the form ("Mega X") since the base sits beside them.
// Tapping a tile opens that Pokémon's own sheet (`onOpen`); the current
// one is inert.
function Tile({ pokemon: p, evolved, current, note, form = false, variant = false, onOpen }) {
  const h = note ? { short: note, full: note } : evolved && p.evoDetail ? how(p) : null;
  const [t1, t2 = t1] = p.types;
  const label = form || variant ? formLabel(p) : p.displayName;
  const Tag = onOpen && !current ? "button" : "div";
  return (
    <Tag
      type={Tag === "button" ? "button" : undefined}
      className={`evo-tile${current ? " current" : ""}${form ? " form" : ""}${variant ? " variant" : ""}`}
      title={form || variant ? p.displayName : undefined}
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

// → evolves into · ⇢ becomes, for a while · ≈ another form of the same
const Arrow = ({ form = false, variant = false }) => (
  <span className={`evo-arrow${form ? " form" : ""}${variant ? " variant" : ""}`} aria-hidden="true">
    {variant ? "≈" : form ? "⇢" : "→"}
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

// The other forms of the Pokémon on the sheet — its species' base first,
// ⇢ the transformations (Charizard ⇢ Mega X / Mega Y / Gigantamax) and
// ≈ the variants (Lycanroc ≈ Midnight / Dusk, Vulpix ≈ Alolan, Zarude ≈
// Dada — the same species in another shape), stacked in pairs. The base
// leads on every form's own sheet, so they all read the same way, the
// Pokémon itself highlighted wherever it is. Null when there are none.
export function FormsRows({ pokemon, onOpen }) {
  const anchor = POKEMON_BY_ID.get(pokemon.species) || pokemon;
  const variants = variantsOf(anchor);
  const forms = [...new Set([anchor, ...variants].flatMap((p) => formsOf(p)))];
  const groups = forms.length || variants.length ? [[anchor, forms, variants]] : [];
  if (!groups.length) return null;
  return (
    <>
      <h4 className="detail-forms-head">Forms</h4>
      <div className="evo-scroll">
        <div className="evo-line forms-line">
          {groups.map(([stage, forms, variants]) => (
            <div key={stage.id} className="evo-node">
              <Tile pokemon={stage} note={baseNote(stage)} current={stage.id === pokemon.id} onOpen={onOpen} />
              {forms.length ? (
                <>
                  <Arrow form />
                  <div className="evo-tiles">
                    {pairsOf(forms).map((pair) => (
                      <div key={pair[0].id} className="evo-col">
                        {pair.map((f) => (
                          <Tile key={f.id} pokemon={f} form note={formTrigger(f)} current={f.id === pokemon.id} onOpen={onOpen} />
                        ))}
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
              {variants.length ? (
                <>
                  <Arrow variant />
                  <div className="evo-tiles">
                    {pairsOf(variants).map((pair) => (
                      <div key={pair[0].id} className="evo-col">
                        {pair.map((v) => (
                          <Tile key={v.id} pokemon={v} variant note={variantNote(v) === formLabel(v) ? null : variantNote(v)} current={v.id === pokemon.id} onOpen={onOpen} />
                        ))}
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default EvolutionLine;
