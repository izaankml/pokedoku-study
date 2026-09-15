import type { Nature } from "../data/natures.ts";

interface NatureCardProps {
  nature: Nature;
}

// The Natures deck's tile: the nature's name where a Pokémon deck shows
// a sprite. Nothing on it gives the answer away, so it is never a button.
function NatureCard({ nature }: NatureCardProps) {
  return (
    <div className="nature-card">
      <span className="nature-kicker">Nature</span>
      <span className="nature-name">{nature.name}</span>
    </div>
  );
}

export default NatureCard;
