import { useEffect } from "react";

// Shared behaviour of the popups: Escape closes, and the page behind is
// frozen in place (see body.no-scroll in App.css) and restored on close.
export function useModalShell(onClose: () => void): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const scrollY = window.scrollY;
    document.body.style.top = `${-scrollY}px`;
    document.body.classList.add("no-scroll");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("no-scroll");
      document.body.style.top = "";
      window.scrollTo(0, scrollY);
    };
  }, [onClose]);
}
