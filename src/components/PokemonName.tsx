interface PokemonNameProps {
  name: string;
}

// Renders a display name with the ♀/♂ of Nidoran in a span, so the glyph
// (which Nunito lacks, so it falls back to a symbol font with a different
// baseline) can be aligned by CSS.
function PokemonName({ name }: PokemonNameProps) {
  const parts = name.split(/([♀♂])/);
  return (
    <>
      {parts.map((part, index) =>
        part === "♀" || part === "♂" ? (
          // eslint-disable-next-line @eslint-react/no-array-index-key -- fixed segments of one string, never reordered
          <span key={index} className="gender-mark">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

export default PokemonName;
