import { evolutionLine, shortHow } from "../logic/evolution.js";
import PokemonName from "./PokemonName.jsx";
import Sprite from "./Sprite.jsx";

// A Pokémon's whole evolution line as a chain of chips — sprite, name and
// (for evolved forms) how it evolved — with arrows between the stages and
// the Pokémon in question highlighted. Branches sit side by side.
function EvolutionLine({ pokemon }) {
  const line = evolutionLine(pokemon);
  if (!line) return <span className="evo-none">Doesn&apos;t evolve</span>;
  return (
    <div className="evo-line">
      {line.levels.map((level, i) => (
        <span key={i} className={`evo-level-wrap${level.length > 1 ? " branch" : ""}`}>
          {i > 0 ? (
            <span className="evo-arrow" aria-hidden="true">
              {level.length > 1 ? "↓" : "→"}
            </span>
          ) : null}
          <span className="evo-level">
            {level.map((p) => (
              <span key={p.id} className={`evo-chip${p.id === line.focusId ? " current" : ""}`}>
                <Sprite pokemon={p} className="sprite evo-sprite" />
                <span className="evo-text">
                  <span className="evo-name">
                    <PokemonName name={p.displayName} />
                  </span>
                  {i > 0 && p.evoDetail ? (
                    <span className="evo-how" title={p.evoDetail}>
                      {shortHow(p.evoDetail)}
                    </span>
                  ) : null}
                </span>
              </span>
            ))}
          </span>
        </span>
      ))}
    </div>
  );
}

export default EvolutionLine;
