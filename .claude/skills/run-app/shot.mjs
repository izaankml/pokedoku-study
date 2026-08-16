// Headless-Chrome driver for PokeDoku Study.
// Usage: node shot.mjs [TabName]   (Browse | Drill | Cards | Grid | Stats)
// Env:   APP_URL (default http://localhost:5173/), CHROME_PATH
import { chromium } from "playwright-core";

const tab = process.argv[2] ?? "Stats";
const url = process.env.APP_URL ?? "http://localhost:5173/";
const executablePath =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const ROOT_SELECTOR = {
  Browse: ".browser",
  Drill: ".drill",
  Cards: ".flashcards",
  Grid: ".board",
  Stats: ".stats-table",
};

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({
  viewport: { width: 900, height: 1400 },
  deviceScaleFactor: 2,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

await page.goto(url, { waitUntil: "networkidle" });
await page.getByRole("tab", { name: tab }).click();
await page.waitForSelector(ROOT_SELECTOR[tab] ?? "main", { timeout: 15_000 });
const out = `${tab.toLowerCase()}.png`;
await page.screenshot({ path: out, fullPage: true });
console.log("screenshot:", out);

if (tab === "Stats") {
  const cols = await page.$$eval(".stats-table", (tables) =>
    tables.map((t) =>
      [...t.querySelectorAll("th")].map((th) =>
        Math.round(th.getBoundingClientRect().left),
      ),
    ),
  );
  console.log("stats-table header x-positions:", JSON.stringify(cols));
}

console.log("errors:", errors);
await browser.close();
