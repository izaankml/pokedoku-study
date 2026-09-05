import type { CSSProperties } from "react";
import { evolutionTree, evoNote, shortHow } from "../logic/evolution.ts";
import type { EvolutionNode } from "../logic/evolution.ts";
import { POKEMON_BY_ID } from "../data/pokedex.ts";
import type { Pokemon } from "../data/types.ts";
import { formLabel, formTrigger, formsRow, isTemporary, isTransformation, variantNote } from "../logic/forms.ts";
import PokemonName from "./PokemonName.tsx";
import Sprite from "./Sprite.tsx";

// A Pokémon's whole evolution line as a tree of square tiles, the Pokémon
// in question highlighted. Each tile is joined by an arrow to its own
// evolutions. Within a branch, evolutions that go no further pack into
// columns (one per generation when three or more span several, else pairs)
// and ones that evolve again get a row each.

// the longest word of a name; the tile shrinks the name's font just enough
// for it to fit (App.css .evo-name)
const longestWord = (name: string): number => Math.max(...name.split(/[\s-]+/).map((word) => word.length));

// How a stage evolved: the chip's short form and the full text for its title.
interface How {
  short: string;
  full: string;
}

function how(pokemon: Pokemon, detail: string): How {
  const note = evoNote(pokemon);
  return {
    short: shortHow(detail) + (note ? `, ${note}` : ""),
    full: detail + (note ? `, ${note}` : ""),
  };
}

const pairsOf = <T,>(list: T[]): T[][] =>
  list.reduce<T[][]>((pairs, item, index) => {
    if (index % 2) pairs[pairs.length - 1].push(item);
    else pairs.push([item]);
    return pairs;
  }, []);
function columnsOf(leaves: EvolutionNode[]): EvolutionNode[][] {
  const gens = [...new Set(leaves.map((leaf) => leaf.pokemon.gen))];
  // two always stack (Typhlosion over Hisuian Typhlosion, whatever their gens)
  return leaves.length > 2 && gens.length > 1
    ? gens.map((gen) => leaves.filter((leaf) => leaf.pokemon.gen === gen))
    : pairsOf(leaves);
}

type OpenSheet = (pokemon: Pokemon) => void;

interface TileProps {
  pokemon: Pokemon;
  // whether this stage evolved from the one before (so its method is shown)
  evolved?: boolean;
  // the sheet's own Pokémon: highlighted and inert
  current?: boolean;
  // replaces the evolution method (a form's trigger, a variant's note)
  note?: string | null;
  // a transformation of the same Pokémon (Mega, Rotom Wash …)
  form?: boolean;
  // a transformation that only holds for a battle: dotted
  temporary?: boolean;
  // a variant of the species: another individual
  variant?: boolean;
  onOpen?: OpenSheet;
}

// A stage: sprite, name, how it evolved, and a strip along the bottom in
// its type colours (split for a dual type). `note` replaces the evolution
// method; `temporary` tiles are dotted. Tapping a tile opens that
// Pokémon's own sheet; the current one is inert.
function Tile({
  pokemon,
  evolved = false,
  current = false,
  note,
  form = false,
  temporary = false,
  variant = false,
  onOpen,
}: TileProps) {
  const method: How | null = note
    ? { short: note, full: note }
    : evolved && pokemon.evoDetail
      ? how(pokemon, pokemon.evoDetail)
      : null;
  const [type1, type2 = type1] = pokemon.types;
  const label = pokemon.displayName; // the full PokeDoku name, forms included ("Lycanroc Dusk", "Venusaur Mega")
  const className = `evo-tile${current ? " current" : ""}${form ? " form" : ""}${temporary ? " temporary" : ""}${variant ? " variant" : ""}`;
  const style = { "--t1": `var(--type-${type1})`, "--t2": `var(--type-${type2})` } as CSSProperties;
  const content = (
    <>
      <Sprite pokemon={pokemon} className="sprite evo-sprite" />
      <span className="evo-name" style={{ "--len": longestWord(label) } as CSSProperties}>
        <PokemonName name={label} />
      </span>
      {method ? (
        <span className="evo-how" title={method.full}>
          {method.short}
        </span>
      ) : null}
      <span className="evo-types" aria-hidden="true" />
    </>
  );
  return onOpen && !current ? (
    <button type="button" className={className} onClick={() => onOpen(pokemon)} style={style}>
      {content}
    </button>
  ) : (
    <div className={className} style={style}>
      {content}
    </div>
  );
}

// → evolves into; any other glyph marks a form relation
const Arrow = ({ glyph = "→" }: { glyph?: string }) => (
  <span className={`evo-arrow${glyph === "→" ? "" : " form"}`} aria-hidden="true">
    {glyph}
  </span>
);

interface NodeProps {
  node: EvolutionNode;
  evolved: boolean;
  focusIds: Set<number>;
  // the other records this node's evolutions also evolve from (the root only)
  coRoots?: Pokemon[];
  onOpen?: OpenSheet;
}

function Node({ node, evolved, focusIds, coRoots = [], onOpen }: NodeProps) {
  const { pokemon, children } = node;
  const own = <Tile pokemon={pokemon} evolved={evolved} current={focusIds.has(pokemon.id)} onOpen={onOpen} />;
  // two pre-evolutions stack before the one arrow (Gimmighoul over Roaming
  // Form Gimmighoul → Gholdengo)
  const tile = coRoots.length ? (
    <div className="evo-col">
      {own}
      {coRoots.map((coRoot) => (
        <Tile key={coRoot.id} pokemon={coRoot} current={focusIds.has(coRoot.id)} onOpen={onOpen} />
      ))}
    </div>
  ) : (
    own
  );
  if (!children.length) return tile;
  if (children.length === 1) {
    return (
      <div className="evo-node">
        {tile}
        <Arrow />
        <Node node={children[0]} evolved focusIds={focusIds} onOpen={onOpen} />
      </div>
    );
  }
  const leaves = children.filter((child) => !child.children.length);
  const chains = children.filter((child) => child.children.length);
  return (
    <div className="evo-node">
      {tile}
      <Arrow />
      <div className="evo-branch">
        {leaves.length ? (
          <div className="evo-tiles">
            {columnsOf(leaves).map((column) => (
              <div key={column[0].pokemon.id} className="evo-col">
                {column.map((leaf) => (
                  <Tile
                    key={leaf.pokemon.id}
                    pokemon={leaf.pokemon}
                    evolved
                    current={focusIds.has(leaf.pokemon.id)}
                    onOpen={onOpen}
                  />
                ))}
              </div>
            ))}
          </div>
        ) : null}
        {chains.map((chain) => (
          <Node key={chain.pokemon.id} node={chain} evolved focusIds={focusIds} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

interface EvolutionLineProps {
  pokemon: Pokemon;
  onOpen?: OpenSheet;
}

function EvolutionLine({ pokemon, onOpen }: EvolutionLineProps) {
  const tree = evolutionTree(pokemon);
  return (
    <div className="evo-scroll">
      <div className="evo-line">
        <Node node={tree.root} evolved={false} focusIds={tree.focusIds} coRoots={tree.coRoots} onOpen={onOpen} />
      </div>
    </div>
  );
}

// The Forms row: the Pokémon and the forms that relate to it directly
// (forms.ts formsRow), one flat wrapping row in dex order, the Pokémon
// itself highlighted. Null when there's nothing.
export function FormsRows({ pokemon, onOpen }: EvolutionLineProps) {
  const list = formsRow(pokemon);
  if (!list.length) return null;
  return (
    <>
      <h4 className="detail-forms-head">Forms</h4>
      <div className="forms-row">
        {list.map((entry) => {
          const transformation = isTransformation(entry);
          const variant = !transformation && entry.id !== (POKEMON_BY_ID.get(entry.species) || entry).id;
          const variantLabel = variant ? variantNote(entry) : null;
          return (
            <Tile
              key={entry.id}
              pokemon={entry}
              form={transformation}
              temporary={isTemporary(entry)}
              variant={variant}
              note={
                transformation
                  ? formTrigger(entry)
                  : variantLabel && variantLabel !== formLabel(entry)
                    ? variantLabel
                    : null
              }
              current={entry.id === pokemon.id}
              onOpen={onOpen}
            />
          );
        })}
      </div>
    </>
  );
}

export default EvolutionLine;
