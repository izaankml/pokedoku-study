// A home-screen web app has no reload button and iOS keeps serving the
// index.html it cached, so a deployed build never reaches it on its own.
// Whenever the app comes to the foreground (and every so often while open)
// fetch a cache-busted copy of index.html; if it references a different
// bundle than the one running, navigate to a fresh URL to pick it up.

const BASE = import.meta.env.BASE_URL;
const INTERVAL = 15 * 60 * 1000;
const RELOADED_KEY = "pds-reloaded-for";

function bundleOf(html: string): string | null {
  return html.match(/\/assets\/index-[\w-]+\.js/)?.[0] ?? null;
}

function currentBundle(): string | null {
  for (const script of document.scripts) {
    const bundle = bundleOf(script.src);
    if (bundle) return bundle;
  }
  return null;
}

let checking = false;

export async function checkForUpdate(): Promise<void> {
  if (checking || !navigator.onLine) return;
  checking = true;
  try {
    const response = await fetch(`${BASE}?_=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return;
    const latest = bundleOf(await response.text());
    const running = currentBundle();
    if (!latest || !running || latest === running) return;
    // one attempt per bundle: a stale CDN copy must not cause a reload loop
    if (sessionStorage.getItem(RELOADED_KEY) === latest) return;
    sessionStorage.setItem(RELOADED_KEY, latest);
    const version = latest.match(/index-([\w-]+)\.js/)?.[1] ?? "";
    location.replace(`${BASE}?v=${version}${location.hash}`);
  } catch {
    // offline or blocked: try again next time
  } finally {
    checking = false;
  }
}

export function startUpdateChecks(): void {
  if (!import.meta.env.PROD) return;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void checkForUpdate();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) void checkForUpdate();
  });
  setInterval(() => void checkForUpdate(), INTERVAL);
  // the first check happens right away
  void checkForUpdate();
}
