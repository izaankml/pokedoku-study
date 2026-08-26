import { useEffect } from "react";

// Shared behaviour of the popups: Escape closes, and the page behind is
// frozen in place (see body.no-scroll in App.css) and restored on close.
// Shells can nest (a detail sheet over the Grid's guess popup): only the
// outermost freezes the page, so the scroll position survives the stack.
export function useModalShell(onClose: () => void): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const alreadyFrozen = document.body.classList.contains("no-scroll");
    const scrollY = window.scrollY;
    if (!alreadyFrozen) {
      document.body.style.top = `${-scrollY}px`;
      document.body.classList.add("no-scroll");
    }
    return () => {
      window.removeEventListener("keydown", onKey);
      if (!alreadyFrozen) {
        document.body.classList.remove("no-scroll");
        document.body.style.top = "";
        window.scrollTo(0, scrollY);
      }
    };
  }, [onClose]);
}
