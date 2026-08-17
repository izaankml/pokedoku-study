import { evolutionTree, evoWhere, shortHow } from "../logic/evolution.js";
import PokemonName from "./PokemonName.jsx";
import Sprite from "./Sprite.jsx";

// A Pokémon's whole evolution line as a tree of square tiles — sprite,
// name and (for evolved forms) how it evolved — the Pokémon in question
// highlighted. Each tile is joined by an arrow to its own evolutions:
// one arrow to a lone evolution, one shared arrow into a column when it
// branches. Within a branch, evolutions that go no further pack into
// vertical pairs (Eevee's eight: four pairs on a desktop, two rows of two
// on a phone) and ones that evolve again get a row each, so Goomy shows
// Sliggoo → Goodra over Hisuian Sliggoo → Hisuian Goodra, and Applin has
// Flapple and Appletun paired above Dipplin → Hydrapple. A lone tile sits
// centred against whatever it's joined to.
function how(p) {
  const where = evoWhere(p);
  return {
    short: shortHow(p.evoDetail) + (where ? `, ${where}` : ""),
    full: p.evoDetail + (where ? `, ${where}` : ""),
  };
}

const pairsOf = (list) => list.reduce((acc, p, i) => (i % 2 ? acc[acc.length - 1].push(p) : acc.push([p]), acc), []);

function Tile({ pokemon: p, evolved, current }) {
  const h = evolved && p.evoDetail ? how(p) : null;
  return (
    <div className={`evo-tile${current ? " current" : ""}`}>
      <Sprite pokemon={p} className="sprite evo-sprite" />
      <span className="evo-name">
        <PokemonName name={p.displayName} />
      </span>
      {h ? (
        <span className="evo-how" title={h.full}>
          {h.short}
        </span>
      ) : null}
    </div>
  );
}

const Arrow = () => (
  <span className="evo-arrow" aria-hidden="true">
    →
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
            {pairsOf(leaves).map((pair) => (
              <div key={pair[0].pokemon.id} className="evo-pair">
                {pair.map((c) => (
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
    <div className="evo-line">
      <Node node={tree.root} evolved={false} focusId={tree.focusId} />
    </div>
  );
}

export default EvolutionLine;
