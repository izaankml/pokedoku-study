import { useLayoutEffect, useRef, useState } from "react";
import type { SVGProps, SyntheticEvent } from "react";
import { spriteCandidates } from "../data/pokedex.ts";
import type { SpriteBox } from "../data/pokedex.ts";
import type { Pokemon } from "../data/types.ts";

// Poké Ball silhouette shown whenever no sprite loads, so the
// offline/broken state still looks intentional.
export function PokeballIcon(props: SVGProps<SVGSVGElement>) {
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

// Pixel sprites draw every Pokémon at its in-game relative size in one
// canvas, so a Charmander is a speck. Each sprite's alpha bounding box
// (prebuilt in sprites.json, or measured here for CORS-able fallbacks) is
// scaled to fill the slot, capped at MAX_UPSCALE so the size relationship
// survives and at MAX_NATIVE_SCALE so pixel art stays crisp.
const FILL = 0.94; // fraction of the slot the sprite's box grows to
const MAX_UPSCALE = 1.8;
const MAX_NATIVE_SCALE = 2;
const ALPHA_MIN = 32;
// src -> box, or null when the sprite can't be measured (a tainted canvas)
const boxCache = new Map<string, SpriteBox | null>();

function measureBox(img: HTMLImageElement): SpriteBox | null {
  const key = img.currentSrc || img.src;
  const cached = boxCache.get(key);
  if (cached !== undefined) return cached;
  let box: SpriteBox | null = null;
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w && h) {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("no 2d context");
      context.drawImage(img, 0, 0);
      const { data } = context.getImageData(0, 0, w, h);
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
      if (x1 >= x0) box = { x0, y0, bw: x1 - x0 + 1, bh: y1 - y0 + 1, w, h };
    } catch {
      // cross-origin canvas taint (or no 2d context): leave it as drawn
    }
  }
  boxCache.set(key, box);
  return box;
}

// CSS transform that centres `box` in a `slot`-px square and scales it up.
function fitTransform(box: SpriteBox, slot: number): string {
  const { x0, y0, bw, bh, w, h } = box;
  const side = Math.max(w, h); // the slot shows the whole canvas, contained
  const nativeCap = (MAX_NATIVE_SCALE * side) / Math.max(slot, 1);
  const scale = Math.min(MAX_UPSCALE, nativeCap, (FILL * side) / Math.max(bw, bh));
  const cx = ((x0 + bw / 2) / w - 0.5) * 100;
  const cy = ((y0 + bh / 2) / h - 0.5) * 100;
  return `translate(${(-cx * scale).toFixed(2)}%, ${(-cy * scale).toFixed(2)}%) scale(${scale.toFixed(3)})`;
}

// A box measured at runtime, remembered with the src it belongs to.
interface MeasuredBox {
  src: string | null;
  // undefined until measured; null when it couldn't be
  box: SpriteBox | null | undefined;
}

interface SpriteProps {
  pokemon: Pokemon;
  className?: string;
  // load right away rather than lazily
  eager?: boolean;
  // what alt/title call the Pokémon when its name must not leak
  // (the Name deck's mystery card)
  label?: string;
}

// Falls back to the base species' sprite, then the silhouette.
function Sprite({ pokemon, className = "sprite", eager = false, label }: SpriteProps) {
  // how many candidates have failed to load, for this Pokémon, so a new
  // one starts over on the same render rather than an effect later
  const [failed, setFailed] = useState({ id: pokemon.id, attempt: 0 });
  const attempt = failed.id === pokemon.id ? failed.attempt : 0;
  const candidates = spriteCandidates(pokemon);
  const candidate = candidates[Math.min(attempt, candidates.length - 1)];
  const src = candidate.url;
  // A box measured at runtime is remembered with the src it belongs to, so
  // a new Pokémon never borrows the previous one's box for a frame.
  const [measured, setMeasured] = useState<MeasuredBox>({ src: null, box: undefined });
  const box = candidate.box ?? (measured.src === src ? measured.box : boxCache.get(src));
  // the transform; "" for as-drawn, null until placed
  const [fit, setFit] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  // Placed before paint, so a sprite never shows un-normalised for a frame
  useLayoutEffect(() => {
    if (box === undefined || !imgRef.current) setFit(null);
    else setFit(box ? fitTransform(box, imgRef.current.clientWidth) : "");
  }, [box, src]);

  if (attempt >= candidates.length) {
    return (
      <div className={`sprite-fallback ${className}`} title={label ?? pokemon.displayName}>
        <PokeballIcon />
      </div>
    );
  }
  const onLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    // sprites without a prebuilt box are measured here (CORS hosts only)
    if (!candidate.box) setMeasured({ src, box: candidate.cors ? measureBox(event.currentTarget) : null });
  };
  return (
    // keyed by Pokémon so a change never shows the previous sprite while
    // the new one loads
    <img
      key={pokemon.id}
      ref={imgRef}
      className={className}
      src={src}
      alt={label ?? pokemon.displayName}
      loading={eager ? "eager" : "lazy"}
      decoding="sync"
      crossOrigin={candidate.cors ? "anonymous" : undefined}
      style={fit === null ? { visibility: "hidden" } : fit ? { transform: fit } : undefined}
      onLoad={onLoad}
      onError={() =>
        setFailed((current) => ({ id: pokemon.id, attempt: (current.id === pokemon.id ? current.attempt : 0) + 1 }))
      }
    />
  );
}

export default Sprite;
