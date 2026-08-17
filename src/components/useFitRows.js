import { useLayoutEffect } from "react";

// Every row of the section (tree and forms) zoomed down by one factor —
// tiles, sprites and text together, so squares stay square and match —
// until the widest fits the sheet, no smaller than MIN_ZOOM; past that
// the row scrolls sideways.
const MIN_ZOOM = 0.7;
export function useFitRows(sectionRef) {
  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!section) return undefined;
    const fit = () => {
      const rows = [...section.querySelectorAll(".evo-scroll")];
      let zoom = 1;
      for (const box of rows) {
        const inner = box.firstElementChild;
        inner.style.zoom = "";
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
