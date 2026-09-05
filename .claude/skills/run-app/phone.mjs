// Phone-emulating driver for the Cards tab: deals a chosen card, optionally
// types a Who's That answer, screenshots the viewport and prints the layout.
// Usage: node phone.mjs <deck> <pokemonSlug|-> <typed|-> <out.png> [answer]
//   deck:    name | type | region | stage | special | matchup | combo:type+region …
//   slug:    dex slug of the Pokémon to deal ("charizardmegax"), or - for random
//   typed:   text to type into Who's That's box and submit with Enter, or -
//   answer:  "go" presses Enter once more; "pick" taps a pick deck's first option
// Env: APP_URL (default http://localhost:5173/), WIDTH/HEIGHT/TOP (CSS px;
//   default 440×956 with a 62px status bar, an iPhone 16 Pro Max as a
//   home-screen app), ENGINE=webkit (no inset emulation there; WEBKIT_PATH
//   points at a cached pw_run.sh when playwright-core wants a newer build)
/* global window, document -- the page callbacks below run in the browser */
import { readFileSync } from "node:fs";
import { chromium, webkit } from "playwright-core";

const [deck = "name", slug = "-", typed = "-", out = "phone.png", answer = "-"] = process.argv.slice(2);
const url = process.env.APP_URL ?? "http://localhost:5173/";
const width = Number(process.env.WIDTH ?? 440);
const height = Number(process.env.HEIGHT ?? 956);
const top = Number(process.env.TOP ?? 62);
const engine = process.env.ENGINE ?? "chromium";

const pokedex = JSON.parse(readFileSync(new URL("../../../src/data/pokedex.json", import.meta.url), "utf8"));
const pokemonId = slug === "-" ? null : pokedex.pokemon.find((entry) => entry.name === slug)?.id;
if (slug !== "-" && !pokemonId) throw new Error(`no such Pokémon: ${slug}`);

const browser =
  engine === "webkit"
    ? await webkit.launch({ headless: true, executablePath: process.env.WEBKIT_PATH })
    : await chromium.launch({
        executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        headless: true,
      });
const context = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => message.type() === "error" && errors.push(message.text()));

if (engine !== "webkit") {
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top, bottom: 34, left: 0, right: 0 } });
}

// the Cards session is read from localStorage on load, so a chosen card
// is planted there first (the shape is CardSession in logic/flashcards.ts)
if (pokemonId) {
  const session = {
    deckId: deck,
    card: { deckId: deck, pokemonId },
    selection: [],
    picked: null,
    comboOk: null,
    recent: [],
    dashes: [],
    history: [],
    viewing: null,
  };
  await context.addInitScript((stored) => {
    window.localStorage.setItem("pokedoku-study:cards:v2", JSON.stringify(stored));
  }, session);
}

await page.goto(`${url}#cards/${deck}`, { waitUntil: "networkidle" });
await page.waitForSelector(".flashcards", { timeout: 15_000 });

if (typed !== "-") {
  await page.locator(".name-box input").fill(typed);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
}
if (answer === "go") {
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
} else if (answer === "pick") {
  await page.locator(".pad-btn").first().click();
  await page.waitForTimeout(400);
}

await page.screenshot({ path: out });
const layout = await page.evaluate(() => {
  const rectOf = (selector) => {
    const element = document.querySelector(selector);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return {
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      height: Math.round(rect.height),
    };
  };
  return {
    innerHeight: window.innerHeight,
    // more than innerHeight means the card doesn't fit and the page scrolls
    scrollHeight: document.documentElement.scrollHeight,
    tile: rectOf(".stage-tile"),
    pad: rectOf(".answer-pad"),
    foot: rectOf(".pad-foot"),
    actions: rectOf(".pad-actions"),
    tabs: rectOf(".tabs"),
    kicker: document.querySelector(".pad-kicker")?.textContent ?? null,
    nudge: document.querySelector(".pad-nudge")?.textContent ?? null,
    summary: document.querySelector(".pad-summary")?.textContent ?? null,
    input: document.querySelector(".name-box input")?.value ?? null,
  };
});
console.log(JSON.stringify(layout, null, 1));
console.log("errors:", errors);
await browser.close();
