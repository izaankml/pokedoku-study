import { useLayoutEffect } from "react";

// The section's tiles (tree and forms) made one size — every tile as tall
// as the tallest — and its rows zoomed by one factor (tiles, sprites and
// text together) so the widest exactly fits the sheet: down as far as it
// takes (nothing scrolls sideways; the sheet may scroll down instead), up
// to MAX_ZOOM when there's room to spare.
const MAX_ZOOM = 1.25;
export function useFitRows(sectionRef, deps) {
  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!section) return undefined;
    const scroller = section.closest(".modal");
    const fit = () => {
      // resetting the zoom shrinks the content for a moment, which would
      // clamp the sheet's scroll position back to the top
      const scrollTop = scroller ? scroller.scrollTop : 0;
      const rows = [...section.querySelectorAll(".evo-scroll")];
      for (const box of rows) box.firstElementChild.style.zoom = "";
      for (const row of section.querySelectorAll(".forms-row")) row.style.zoom = "";
      // every tile of the sheet as tall as its tallest (a two-line name
      // over a two-line method), so tree and forms tiles all match
      section.style.removeProperty("--evo-tile-h");
      const tiles = [...section.querySelectorAll(".evo-tile")];
      const tallest = Math.max(0, ...tiles.map((t) => t.offsetHeight));
      if (tallest) section.style.setProperty("--evo-tile-h", `${tallest}px`);
      let zoom = MAX_ZOOM;
      for (const box of rows) {
        const inner = box.firstElementChild;
        const avail = box.clientWidth - parseFloat(getComputedStyle(box).paddingLeft) * 2;
        inner.style.minWidth = "0"; // its natural width, not the "at least the sheet" one
        zoom = Math.min(zoom, (avail / inner.scrollWidth) * 0.995); // a hair under, so rounding never leaves a scrollbar
        inner.style.minWidth = "";
      }
      for (const box of rows) box.firstElementChild.style.zoom = String(zoom);
      // the Forms row wraps rather than scrolls, but takes the same zoom so
      // its tiles match the tree's
      for (const row of section.querySelectorAll(".forms-row")) row.style.zoom = String(zoom);
      if (scroller) scroller.scrollTop = scrollTop;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(section);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
