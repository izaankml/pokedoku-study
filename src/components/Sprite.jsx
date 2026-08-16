import { useEffect, useState } from "react";
import { spriteCandidates } from "../data/pokedex.js";

// Poké Ball silhouette shown whenever no sprite loads, so the
// offline/broken state still looks intentional.
export function PokeballIcon(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h6.6M14.4 12H21" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );
}

// PokeAPI draws every Pokémon at its in-game relative size inside the same
// 96×96 canvas, so Charmander is a speck and Gigantamax Venusaur fills the
// frame. Each sprite is measured once (alpha bounding box) and transformed
// so that box fills the slot — capped, so tiny Pokémon read clearly without
// erasing the size relationship altogether. Slots are square, so the
// transform can be expressed in the sprite's own percentages and needs no
// layout measurement.
const FILL = 0.94; // fraction of the slot the sprite's box grows to
const MAX_UPSCALE = 1.8;
const ALPHA_MIN = 32;
const fitCache = new Map(); // src -> transform string, or "" when unmeasurable

function measureFit(img) {
  const cached = fitCache.get(img.currentSrc || img.src);
  if (cached !== undefined) return cached;
  let fit = "";
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w && h) {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, w, h);
      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (data[(y * w + x) * 4 + 3] > ALPHA_MIN) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      if (x1 >= x0) {
        const bw = x1 - x0 + 1;
        const bh = y1 - y0 + 1;
        const side = Math.max(w, h); // the slot shows the whole canvas, contained
        const s = Math.min(MAX_UPSCALE, (FILL * side) / Math.max(bw, bh));
        // move the box's centre onto the slot's centre, in the sprite's own %
        const cx = ((x0 + bw / 2) / w - 0.5) * 100;
        const cy = ((y0 + bh / 2) / h - 0.5) * 100;
        fit = `translate(${(-cx * s).toFixed(2)}%, ${(-cy * s).toFixed(2)}%) scale(${s.toFixed(3)})`;
      }
    } catch {
      // cross-origin canvas taint (or no 2d context) — leave it as drawn
    }
  }
  fitCache.set(img.currentSrc || img.src, fit);
  return fit;
}

// Falls back to the base species' sprite, then the silhouette.
function Sprite({ pokemon, className = "sprite", eager = false }) {
  const [attempt, setAttempt] = useState(0);
  const [fit, setFit] = useState(null); // null until measured
  useEffect(() => {
    setAttempt(0);
    setFit(null);
  }, [pokemon.id]);
  const urls = spriteCandidates(pokemon);
  if (attempt >= urls.length) {
    return (
      <div className={`sprite-fallback ${className}`} title={pokemon.displayName}>
        <PokeballIcon />
      </div>
    );
  }
  const src = urls[attempt];
  // A sprite seen before is placed correctly on first paint; a new one is
  // kept invisible for the frame it takes to measure, so it never jumps.
  const known = fit ?? fitCache.get(src) ?? null;
  return (
    // keyed by Pokémon so a change never shows the previous sprite while
    // the new one loads
    <img
      key={pokemon.id}
      className={className}
      src={src}
      alt={pokemon.displayName}
      loading={eager ? "eager" : "lazy"}
      decoding="sync"
      crossOrigin="anonymous"
      style={known === null ? { visibility: "hidden" } : known ? { transform: known } : undefined}
      onLoad={(e) => setFit(measureFit(e.currentTarget))}
      onError={() => {
        setFit(null);
        setAttempt((a) => a + 1);
      }}
    />
  );
}

export default Sprite;
