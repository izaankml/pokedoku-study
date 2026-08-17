import { evolutionLine, evoWhere, shortHow } from "../logic/evolution.js";
import PokemonName from "./PokemonName.jsx";
import Sprite from "./Sprite.jsx";

// A Pokémon's whole evolution line as a row of stages, arrows between
// them, the Pokémon in question highlighted. Each stage is a tile — sprite,
// name and (for evolved forms) how it evolved. A level with several
// Pokémon (Wurmple's cocoons, Eevee's eight) stacks its tiles in a column
// — a second column only past STACK — so the line reads left to right as
// a tree.
const STACK = 4;
function how(p) {
  const where = evoWhere(p);
  return {
    short: shortHow(p.evoDetail) + (where ? `, ${where}` : ""),
    full: p.evoDetail + (where ? `, ${where}` : ""),
  };
}

function EvolutionLine({ pokemon }) {
  const line = evolutionLine(pokemon);
  if (!line) return <p className="evo-none">Doesn&apos;t evolve</p>;
  return (
    <div className="evo-line">
      {line.levels.map((level, i) => (
        <div key={i} className="evo-level">
          {i > 0 ? (
            <span className="evo-arrow" aria-hidden="true">
              →
            </span>
          ) : null}
          <div
            className="evo-tiles"
            style={level.length > 1 ? { gridTemplateRows: `repeat(${Math.min(level.length, STACK)}, auto)` } : undefined}
          >
            {level.map((p) => {
              const h = i > 0 && p.evoDetail ? how(p) : null;
              return (
                <div key={p.id} className={`evo-tile${p.id === line.focusId ? " current" : ""}`}>
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
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default EvolutionLine;
