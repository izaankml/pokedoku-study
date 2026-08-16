// Renders a display name with the ♀/♂ of Nidoran in a span so the glyph
// (which Nunito lacks — it falls back to a symbol font with a different
// baseline) can be aligned by CSS.
function PokemonName({ name }) {
  const parts = name.split(/([♀♂])/);
  return (
    <>
      {parts.map((part, i) =>
        part === "♀" || part === "♂" ? (
          <span key={i} className="gender-mark">
            {part}
          </span>
        ) : (
          part
        )
      )}
    </>
  );
}

export default PokemonName;
