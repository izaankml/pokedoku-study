// A home-screen web app has no reload button and iOS keeps serving the
// index.html it cached, so a deployed build never reaches it on its own.
// Whenever the app comes to the foreground (and every so often while open)
// fetch a cache-busted copy of index.html; if it references a different
// bundle than the one running, navigate to a fresh URL to pick it up.

const BASE = import.meta.env.BASE_URL;
const INTERVAL = 15 * 60 * 1000;
const RELOADED_KEY = "pds-reloaded-for";

function bundleOf(html) {
  return html.match(/\/assets\/index-[\w-]+\.js/)?.[0] ?? null;
}

function currentBundle() {
  for (const s of document.scripts) {
    const b = bundleOf(s.src);
    if (b) return b;
  }
  return null;
}

let checking = false;

export async function checkForUpdate() {
  if (checking || !navigator.onLine) return;
  checking = true;
  try {
    const res = await fetch(`${BASE}?_=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return;
    const latest = bundleOf(await res.text());
    const running = currentBundle();
    if (!latest || !running || latest === running) return;
    // one attempt per bundle: a stale CDN copy must not cause a reload loop
    if (sessionStorage.getItem(RELOADED_KEY) === latest) return;
    sessionStorage.setItem(RELOADED_KEY, latest);
    const v = latest.match(/index-([\w-]+)\.js/)[1];
    location.replace(`${BASE}?v=${v}${location.hash}`);
  } catch {
    // offline or blocked: try again next time
  } finally {
    checking = false;
  }
}

export function startUpdateChecks() {
  if (!import.meta.env.PROD) return;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkForUpdate();
  });
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) checkForUpdate();
  });
  setInterval(checkForUpdate, INTERVAL);
  // the first check happens right away
  checkForUpdate();
}
