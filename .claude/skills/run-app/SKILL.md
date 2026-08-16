---
name: run-app
description: Launch the PokeDoku Study Vite dev server, drive it in headless Chrome with Playwright, and screenshot a tab (e.g. Stats) to visually confirm a UI change.
---

# Run PokeDoku Study and screenshot a view

React + Vite single-page app. "Running" means: dev server up, headless
Chrome navigates to it, clicks a tab, screenshots. Tabs are `Browse`,
`Drill` (default), `Cards`, `Grid`, `Stats`.

## 1. Dev server

```bash
npm install                                  # first time only; vite is a devDependency
npx vite --port 5173 --strictPort            # run as a background task
timeout 30 bash -c 'until curl -sf http://localhost:5173 >/dev/null; do sleep 1; done'
```

Start it as a background task and stop it afterwards via that task's ID
(TaskStop). Never terminate processes found by port lookup — a
protect-ports hook blocks that, and it could hit the user's own dev
servers. `--strictPort` fails fast if 5173 is taken; pick another port
and pass it to the driver via `APP_URL`.

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
- clicks the tab via `getByRole("tab", { name })` — tabs are
  `<button role="tab">`, so `getByRole("button")` times out
- waits for the tab's root selector, saves `<tab>.png` full-page at 2x
- on the Stats tab, prints `<th>` x-positions for every `.stats-table`
  so column alignment can be checked numerically
- prints console/page errors — confirm they're empty before declaring success

Then **Read the PNG** and look at it. Numbers alone don't prove the
page rendered.

## 3. Gotchas

- Fresh profile = empty stats: every row shows `0` / `—`. Expected.
- The Cross-device sync panel on Stats shows a GitHub token box; leave
  it — nothing needs auth to render.
- Fonts are bundled (`@fontsource-variable/nunito`); no network needed
  beyond localhost.
- If Chrome isn't at
  `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, set
  `CHROME_PATH`, or use the Playwright cache at
  `~/Library/Caches/ms-playwright/chromium-*/chrome-mac-arm64/...`.
