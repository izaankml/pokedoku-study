import { evolutionLine, shortHow } from "../logic/evolution.js";
import PokemonName from "./PokemonName.jsx";
import Sprite from "./Sprite.jsx";

// A Pokémon's whole evolution line as a row of stages, arrows between
// them, the Pokémon in question highlighted. Each stage is a tile — sprite,
// name and (for evolved forms) how it evolved. A level with several
// Pokémon (Wurmple's cocoons, Eevee's eight) is one column that stacks or
// grids its tiles, so the line still reads left to right as a tree.
function EvolutionLine({ pokemon }) {
  const line = evolutionLine(pokemon);
  if (!line) return <p className="evo-none">Doesn&apos;t evolve</p>;
  return (
    <div className="evo-line">
      {line.levels.map((level, i) => (
        <div key={i} className={`evo-level${level.length > 1 ? " branch" : ""}`}>
          {i > 0 ? (
            <span className="evo-arrow" aria-hidden="true">
              →
            </span>
          ) : null}
          <div className="evo-tiles">
            {level.map((p) => (
              <div key={p.id} className={`evo-tile${p.id === line.focusId ? " current" : ""}`}>
                <Sprite pokemon={p} className="sprite evo-sprite" />
                <span className="evo-name">
                  <PokemonName name={p.displayName} />
                </span>
                {i > 0 && p.evoDetail ? (
                  <span className="evo-how" title={p.evoDetail}>
                    {shortHow(p.evoDetail)}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default EvolutionLine;
