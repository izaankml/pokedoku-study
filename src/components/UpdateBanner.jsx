import { useEffect, useState } from "react";

// GitHub Pages serves index.html with a 10-minute cache, so after a deploy a
// phone can keep running the old build. Whenever the tab is opened or comes
// back into view, fetch index.html fresh and compare the bundle it names to
// the one running; if it's newer, offer a reload.
const bundleOf = (html) => (html.match(/assets\/index-[\w-]+\.js/) || [])[0] || null;
const running = () => bundleOf([...document.scripts].map((s) => s.src).join(" "));

function UpdateBanner() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!import.meta.env.PROD) return undefined;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}index.html`, { cache: "no-store" });
        const latest = bundleOf(await res.text());
        if (latest && running() && latest !== running()) setReady(true);
      } catch {
        // offline: nothing to do
      }
    };
    check();
    document.addEventListener("visibilitychange", check);
    const timer = setInterval(check, 5 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", check);
      clearInterval(timer);
    };
  }, []);
  if (!ready) return null;
  return (
    <div className="update-banner" role="status">
      A newer version is available.
      <button type="button" onClick={() => window.location.reload()}>
        Reload
      </button>
    </div>
  );
}

export default UpdateBanner;
