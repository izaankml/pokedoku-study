# Review notes — 2026-08-16 session

Decisions and assumptions made while working autonomously, for review.
Delete this file once reviewed; anything worth keeping is in README.md.

## Sources used

- PokeDoku's own answer list: `GET https://api.pokedoku.com/api/pokemon/all`
  (1,323 visible entries, PokeAPI ids). Its frontend bundle carries the
  category ids (`MEGA_EVOLVED`, `GMAX_FORM`, `EVOLVED_BY-stone/-item`,
  `NOT FULLY_EVOLVED`, `HAS_BRANCHED_EVOLUTION`, `LEGENDARY_TRIO`,
  `POKEMON_MOVE`, `POKEMON_ABILITY`) and rule notes.
- PokeDoku's "How to play" (pasted by you) — regions and forms rules.
- pokedoku-helper.com (open source: github.com/jlast/pokedoku-solver): a
  per-entry category dataset derived from PokeAPI + hand overrides, tuned
  against real puzzles. Used as the oracle for evolution triggers, stage
  semantics, per-entry Mega/Gmax, first partners, and validated moves/
  abilities. `scripts/check-against-helper.mjs` re-runs the diff.

## Decisions (data model)

1. **Mega/Gigantamax are the form records, not the base species.** Base
   Charizard is no longer "Mega"/"Gmax"; Mega Charizard X/Y and Gigantamax
   Charizard are (96 Mega + 34 Gmax records). Evidence: PokeDoku's ids
   `MEGA_EVOLVED`/`GMAX_FORM`, separate answer entries, and helper counts
   (96/34) that only work per-entry. **Impact on you:** for a Mega cell,
   type "Mega Charizard X", not "Charizard". If PokeDoku actually accepts
   plain "Charizard" too, flip `formFlags`/`speciesFlags` in
   `scripts/build-dataset.mjs`.
2. Mega/Gmax forms: no evolution stage/method (helper: `IGNORE_EVOLVE_FORMS`),
   keep Legendary/Mythical/Fossil (Mega Aerodactyl is a Fossil), are **not**
   First Partners (Mega Venusaur isn't). Ash-Greninja likewise has no stage
   and isn't a starter. This asymmetry (fossil yes, starter no) is copied
   from the helper's curated lists, not verified against PokeDoku.
3. Evolution methods are multi-valued (`evoMethods`), following the
   helper/PokeAPI: friendship ⇒ also level; held item ⇒ item + level;
   trade with item ⇒ trade + item; Linking Cord ⇒ Alakazam/Machamp/Golem/
   Gengar also item; modern-game stones ⇒ Magnezone/Probopass/Vikavolt/
   Crabominable/Leafeon/Glaceon also item(+stone); "other" methods mapped
   per PokeAPI trigger names (Shedinja/Kingambit/Gholdengo/Annihilape/…
   = level; Alcremie/Urshifu = item; Sirfetch'd/Runerigus/Wyrdeer = none;
   Melmetal = none). Full list: `EVO_METHOD_OVERRIDES` in
   `scripts/manual-lists.mjs`.
4. **Added an "Evolved by stone" category** (used evolution stone, not
   held). PokeDoku's bundle has an `EVOLVED_BY-stone` note ("The stone must
   be usable not held") but its link map only lists level/item/trade/
   friendship — so Stone may be dormant. Harmless if so; remove from
   `src/data/categories.js` if it never shows up in puzzles.
5. Stage is form-aware (Kantonian Farfetch'd/Corsola/Qwilfish/Red-Striped
   Basculin = no evolution line; Mr. Mime, Linoone = final). Matches the
   helper's overrides. Meltan→Melmetal link added by hand.
6. **Branched** = evolves into ≥2 distinct *species* (Rockruff not, Scyther
   yes). "Not fully evolved" = first or middle. Both added as categories.
7. Regions: regional-named forms → debut region only; Mega/Gmax/Primal →
   base region; other forms debuting elsewhere → both. Overrides for
   ORAS/FRLG debuts: Hoopa Unbound = Kalos + Hoenn, Deoxys Attack/Defense
   = Hoenn + Kanto (Speed = Hoenn). Zygarde 10%/Complete and Ash-Greninja
   = Kalos + Alola. Primal Groudon/Kyogre = Hoenn only. Meltan/Melmetal =
   no region. All match the helper.
8. First partners include Hisuian Typhlosion/Samurott/Decidueye and the
   Let's Go Partner Pikachu/Eevee (own records, no evolution line, Kanto).
   Manual list comment used to say the opposite; the helper's tip page and
   PokeDoku's "core-series games" note settled it.
9. **Moves (22) and abilities (5) added as categories.** Move list = the 21
   the helper has seen in puzzles + Dragon Rage (in PokeDoku's bundle).
   Learnsets from @pkmn/dex, any gen/method except events, no pre-evo
   chaining (mirrors PokeAPI's per-Pokémon lists); 99.5% agreement with the
   helper. Gmax forms have no moves (PokeAPI has none). PokeDoku can add
   moves at any time — `src/data/traits.js` is the one place to extend.
10. Legendary Trio exists in PokeDoku but neither the helper nor this app
    models it (no clear membership list). Not added.
11. Form records are only kept when they add a category the base lacks —
    except Mega/Gmax, which always stay (they carry the flag). 232 form
    records now; 45 candidates dropped (Kyurem-B/W, Lycanroc forms, …).
12. Pair validity: same-group pairs are blocked only for type-count and
    stage. Region×region, method×method, move×move etc. are allowed when
    the intersection is non-empty (dual-region forms, Alakazam trade×item).
13. Base Meowstic and Tatsugiri gained the "has a Mega" fact via the new
    forme-name detection (Z-A "M-Mega"/"Curly-Mega" lack `isMega` in the
    dex) — now surfaced as Mega Meowstic / Mega Tatsugiri records.

## Decisions (flashcards)

14. Four decks: Region, Special group (Legendary/Mythical/UB/Paradox/Fossil/
    First partner/Baby/None), Stage, Method. "All" mixes decks. A card with
    several right answers (Koraidon: Paradox and Legendary; Alakazam: trade
    and item) accepts any and highlights all.
15. Only species and forms whose answer differs from their base are asked;
    Mega/Gmax forms are never asked. Region deck skips Meltan/Melmetal.
16. Stats keys: region deck keeps the bare id (old history still counts);
    other decks use `deck:id`. Card categories are recorded against the
    answer categories (so Special cards feed the flag rows in Stats).
17. **Skip** moves on without recording; **Give up** records a miss and
    reveals. Card state lives in a module-level session
    (`src/logic/flashcards.js`) so tab switches keep it, answered or not.
    Changing deck replaces an *unanswered* card; an answered one stays
    until Next.

## Decisions (UI)

18. Bottom nav (phones): now a solid `--surface-1` bar with a `--border`
    top edge, 54px tall. Safe-area padding is capped at 8px in a browser
    (Safari's own toolbar already covers the home indicator there) and
    only the full inset applies as a home-screen app
    (`@media (display-mode: standalone)`). **Assumption**: iOS 26 Safari
    keeps content visible in the band it reports as inset — check on device;
    if the labels sit under the home indicator when the toolbar collapses,
    raise the 8px cap.
19. Spaced-review tiles: on ≤520px the row label moves above the tiles and
    tiles take the full width; "Due now" → "Due".
20. Answer-grid cards reserve two caption lines so every row is the same
    height. The remaining size difference is PokeAPI's sprite framing
    (classic 96px sprites vs the larger Z-A form renders) — a different
    sprite set (PokeAPI "home" renders) would fix it at ~10× the bytes.
21. The top "Pokédex lid" strip is desktop-only now and solid accent (the
    fade-to-transparent was a styling choice from the redesign). On phones
    it painted a 3px line just under Safari's status bar that read as a
    stray bar.
21b. Flashcard layout: the sprite sits alone in a 168px circle with the
    name below (the name used to overlap the circle); the caption block
    reserves three lines and the option grid reserves its tallest deck
    (2 rows desktop, 5 rows phone), so the answer buttons and Skip/Give
    up/Next stay in the same place across cards, decks and answer states
    (measured identical in headless Chrome). Method options read
    Level-up / Item / Stone / Trade / Friendship on cards.
22. Stats table on phones: the narrow-column override sat *before* the base
    rules in App.css and never applied; moved after them, header type
    tightened, Accuracy header right-aligned like its values.

## Sync devices (why "5 devices")

23. Every browser storage that ever synced owns a block in the gist forever:
    phone Safari, the home-screen app (separate storage), each desktop
    browser, private windows — and **"Reset this device's stats" used to
    mint a new device id**, orphaning the old block. So the count grew with
    every reset/reinstall. Fixes: reset now keeps the device id; devices are
    auto-named ("iPhone · Safari", "Mac · Chrome", "iPhone · Home screen
    app"); the sync panel has a **Devices** list (answers, last active) with
    **Merge into this device** for stale duplicates — it folds that block's
    counts/streaks into this device (nothing lost) and removes it from the
    gist. Merging a device you still use is safe too: it just starts a
    fresh block on its next sync.

## Not done / open

- Legendary Trio category (see 10).
- Verifying PokeDoku's Mega/Gmax acceptance of base species (see 1) and
  Primal/ORAS region handling (see 7) against a live puzzle — the puzzle
  APIs need a login.
- Old flashcard history keyed by species id now only feeds the Region deck.
