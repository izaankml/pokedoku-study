---
name: run-app
description: Launch the PokeDoku Study Vite dev server, drive it in headless Chrome with Playwright, and screenshot a tab (e.g. Stats) to visually confirm a UI change.
---

# Run PokeDoku Study and screenshot a view

React + Vite single-page app. "Running" means: dev server up, headless
Chrome navigates to it, clicks a tab, screenshots. Tabs are `Browse`
(default), `Drill`, `Cards`, `Grid`, `Stats`. Each tab is also reachable
by hash, with its state after it (`#cards/region`,
`#browse/type-fire/flag-legendary`, `#drill/<a>/<b>`), which is the
quickest way to land a headless page on a specific view.

## 1. Dev server

```bash
npm install                                  # first time only; vite is a devDependency
npx vite --port 5173 --strictPort            # run as a background task
timeout 30 bash -c 'until curl -sf http://localhost:5173 >/dev/null; do sleep 1; done'
```

Start it as a background task and stop it afterwards via that task's ID
(TaskStop). Never terminate processes found by port lookup: it could hit
the user's own dev servers. `--strictPort` fails fast if 5173 is taken;
pick another port and pass it to the driver via `APP_URL`.

## 2. Driver (Playwright + local Chrome)

`chromium-cli` is not installed on this machine, and no `playwright`
package is cached. Use `playwright-core` (no browser download) pointed
at the system Google Chrome. Set up in the scratchpad, not the repo:

```bash
cd "$SCRATCHPAD" && npm init -y >/dev/null && npm install playwright-core
cp /path/to/repo/.claude/skills/run-app/shot.mjs .
node shot.mjs Stats                          # tab name; default Stats
```

`shot.mjs` (kept next to this file):
- goes to `http://localhost:5173/` (override with `APP_URL`)
- clicks the tab via `getByRole("tab", { name })`; tabs are
  `<button role="tab">`, so `getByRole("button")` times out
- waits for the tab's root selector, saves `<tab>.png` full-page at 2x
- on the Stats tab, prints `<th>` x-positions for every `.stats-table`
  so column alignment can be checked numerically
- prints console/page errors; confirm they're empty before declaring success

`phone.mjs` (also next to this file) is the Cards driver: it emulates a
phone (440×956 with a 62px status bar by default, see the gotchas), plants
a chosen card in localStorage before load, can type and submit a Who's
That answer, and prints the layout (tile, pad, foot, tab pill, and
whether `scrollHeight` exceeds `innerHeight`, meaning the card doesn't fit):

```bash
cp /path/to/repo/.claude/skills/run-app/phone.mjs .
node phone.mjs name charizardmegax "Charizard" nudge.png   # deck, slug, typed, out
HEIGHT=800 node phone.mjs type charizard - short.png       # a shorter screen
```

Then **Read the PNG** and look at it. Numbers alone don't prove the
page rendered.

## 3. Gotchas

- Fresh profile = empty stats: every row shows `0` or a dash. Expected.
- The Cross-device sync panel on Stats shows a "Sign In with Google"
  button (the GitHub-token form is folded under "Legacy"); leave it.
  Nothing needs auth to render.
- Fonts are bundled (`@fontsource-variable/nunito`); no network needed
  beyond localhost.
- If Chrome isn't at
  `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, set
  `CHROME_PATH`, or use the Playwright cache at
  `~/Library/Caches/ms-playwright/chromium-*/chrome-mac-arm64/...`.
- For a Safari-engine check (the user's phone is iOS), Playwright's
  WebKit build is cached at `~/Library/Caches/ms-playwright/webkit-*`
  (installed with `npx playwright-core install webkit`). A newer
  `playwright-core` may want a newer build than the cached one: pass the
  cached `webkit-*/pw_run.sh` as `executablePath` (`WEBKIT_PATH` for
  `phone.mjs`), and the older build drives fine. Chrome and WebKit have
  differed on container query units in flex layouts, so check both when
  a change leans on them.
- A phone in standalone (home-screen) mode has the status bar inside
  `100dvh` and pads it out with `env(safe-area-inset-top)`. Emulate that
  in Chromium with the real screen size plus a CDP session:
  `cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 62, bottom: 34, left: 0, right: 0 } })`
  (iPhone 16 Pro Max 440×956, top 62; iPhone 15 393×852, top 59; 13
  mini 375×812, top 50; SE 375×667, top 20). The shortcut of the screen
  height minus the status bar with no insets (440×894, 393×793, 375×762,
  375×647) gives the same layout only where the CSS subtracts the inset
  itself, as the Cards fit maths does. Emulated insets take the browser's
  pill rules, not standalone's, so the pill sits 8px higher than on the
  phone.
