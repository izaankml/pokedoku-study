import PokemonCard from "./PokemonCard.jsx";

function AnswerList({ pokemon, title, highlightId }) {
  return (
    <section className="answer-list">
      {title ? (
        <h3>
          {title} <span className="count">({pokemon.length})</span>
        </h3>
      ) : null}
      <div className="answer-grid">
        {pokemon.map((p) => (
          <div key={p.id} className={p.id === highlightId ? "highlight" : ""}>
            <PokemonCard pokemon={p} />
          </div>
        ))}
      </div>
    </section>
  );
}

export default AnswerList;
