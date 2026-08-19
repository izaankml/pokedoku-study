import type { CSSProperties } from "react";
import { evolutionTree, evoNote, shortHow } from "../logic/evolution.ts";
import type { EvolutionNode } from "../logic/evolution.ts";
import { POKEMON_BY_ID } from "../data/pokedex.ts";
import type { Pokemon } from "../data/types.ts";
import { formLabel, formTrigger, formsRow, isTransformation, variantNote } from "../logic/forms.ts";
import PokemonName from "./PokemonName.tsx";
import Sprite from "./Sprite.tsx";

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
  // a transformation: dashed, "becomes, for a while"
  form?: boolean;
  // a variant of the species: another individual
  variant?: boolean;
  onOpen?: OpenSheet;
}

// A stage: sprite, name, how it evolved, and a strip along the bottom in
// its type colours (split for a dual type — the thing that changes along
// a line: Charmander → Charizard gains Flying, Eevee's eight differ).
// `note` (a form's trigger) replaces the evolution method; `form` tiles
// are dashed to read as "becomes, for a while" rather than "evolves into".
// Tapping a tile opens that Pokémon's own sheet (`onOpen`); the current
// one is inert.
function Tile({ pokemon, evolved = false, current = false, note, form = false, variant = false, onOpen }: TileProps) {
  const method: How | null = note
    ? { short: note, full: note }
    : evolved && pokemon.evoDetail
      ? how(pokemon, pokemon.evoDetail)
      : null;
  const [type1, type2 = type1] = pokemon.types;
  const label = pokemon.displayName; // the full PokeDoku name, forms included ("Lycanroc Dusk", "Venusaur Mega")
  const className = `evo-tile${current ? " current" : ""}${form ? " form" : ""}${variant ? " variant" : ""}`;
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

// → evolves into · ⇢ becomes, for a while · ⇠ is a form of · ≈ another
// form of the same
const Arrow = ({ glyph = "→" }: { glyph?: string }) => (
  <span className={`evo-arrow${glyph === "→" ? "" : " form"}`} aria-hidden="true">
    {glyph}
  </span>
);

interface NodeProps {
  node: EvolutionNode;
  evolved: boolean;
  focusId: number;
  onOpen?: OpenSheet;
}

function Node({ node, evolved, focusId, onOpen }: NodeProps) {
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
                    current={leaf.pokemon.id === focusId}
                    onOpen={onOpen}
                  />
                ))}
              </div>
            ))}
          </div>
        ) : null}
        {chains.map((chain) => (
          <Node key={chain.pokemon.id} node={chain} evolved focusId={focusId} onOpen={onOpen} />
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
