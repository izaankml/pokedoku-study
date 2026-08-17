import { useLayoutEffect } from "react";

// The section's tiles (tree and forms) made one size — every tile as tall
// as the tallest — and its rows zoomed down by one factor (tiles, sprites
// and text together) until the widest fits the sheet, no smaller than
// MIN_ZOOM; past that the row scrolls sideways.
const MIN_ZOOM = 0.7;
export function useFitRows(sectionRef) {
  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!section) return undefined;
    const fit = () => {
      const rows = [...section.querySelectorAll(".evo-scroll")];
      for (const box of rows) box.firstElementChild.style.zoom = "";
      // every tile of the sheet as tall as its tallest (a two-line name
      // over a two-line method), so tree and forms tiles all match
      section.style.removeProperty("--evo-tile-h");
      const tiles = [...section.querySelectorAll(".evo-tile")];
      const tallest = Math.max(0, ...tiles.map((t) => t.offsetHeight));
      if (tallest) section.style.setProperty("--evo-tile-h", `${tallest}px`);
      let zoom = 1;
      for (const box of rows) {
        const inner = box.firstElementChild;
        const avail = box.clientWidth - parseFloat(getComputedStyle(box).paddingLeft) * 2;
        zoom = Math.min(zoom, avail / inner.scrollWidth);
      }
      zoom = Math.max(MIN_ZOOM, zoom);
      for (const box of rows) box.firstElementChild.style.zoom = zoom < 1 ? String(zoom) : "";
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(section);
    return () => ro.disconnect();
  });
}
