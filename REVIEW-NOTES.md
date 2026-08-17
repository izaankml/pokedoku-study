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
   type "Charizard Mega X" (PokeDoku's naming; "Mega Charizard X" also
   matches), not "Charizard". If PokeDoku actually accepts
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
21. The top "Pokédex lid" strip is a solid accent line (the fade was a
    styling choice from the redesign) on every size, fixed just below the
    status bar on phones (`top: env(safe-area-inset-top)`), at the very
    top on desktop.
21b. Flashcard layout: the sprite sits alone in a 168px circle with the
    name below (the name used to overlap the circle); the caption block
    reserves three lines and the option grid reserves its tallest deck
    (2 rows desktop, 5 rows phone), so the answer buttons and Skip/Give
    up/Next stay in the same place across cards, decks and answer states
    (measured identical in headless Chrome). Method options read
    Level-up / Item / Stone / Trade / Friendship on cards. On phones the
    whole card (chips → Skip/Give up) fits above the nav without scrolling
    in Safari's ~680px of visible height: 128px circle, 3-column option
    grid reserving 4 rows of 42px, tighter caption. Verified at a 440×744
    viewport with the 59px status-bar inset emulated.
22. Stats table on phones: the narrow-column override sat *before* the base
    rules in App.css and never applied; moved after them, header type
    tightened, Accuracy header right-aligned like its values.

24. Overscroll: the app now scrolls inside `#root` (`html, body`
    overflow hidden; `#root` 100dvh, `overscroll-behavior: contain`). iOS
    bounces the entire web view — fixed strip and nav included — when the
    *root* overscrolls, which is what made the strip float and the nav
    vanish at the top/bottom of a page; an inner scroller only bounces its
    own content. Tab switches reset `#root`'s scroll. Side effects to check
    on device: Safari's toolbar may no longer auto-minimise while scrolling
    (inner scrollers don't drive it), and the top strip is fixed with the
    status-bar area painted dark above it. Bonus: the desktop tab bar's
    `position: sticky` had never worked (it was boxed inside a short
    `<header>`); `header { display: contents }` fixes it.

25. Tab routing: the active tab is in the URL hash (`#browse`, `#drill`,
    `#cards`, `#grid`, `#stats`), pushed on each tab click, so refresh,
    back/forward and shared links land on the same tab; no hash = Drill.
    The QR-handoff hash (`#connect=…`) is consumed and cleared before the
    tab is read, so the two don't collide.

26. Browse: default is Regions → From Kanto; the default tab is Browse;
    Regions is the first optgroup (CATEGORY_GROUPS reordered, so the Stats
    tables list Regions first too). Each dropdown disables categories that
    can't pair with the other side's pick (`pairIsValid`: exclusive group,
    or no Pokémon fits both — Legendary × Mythical, First × Middle stage,
    Baby × Dragon); changing the first drops a second that no longer fits.

27. Cards & sprites: PokeAPI has no sprite for Partner Pikachu (10158),
    Partner Eevee (10159) or Mega Zygarde (10301); `Sprite` now falls back
    to the base species' sprite before the Poké Ball silhouette. Partner
    Pikachu is a real PokeDoku answer (`pikachu-partner`, id 10158, visible
    in its list) so it stays. Answer-grid captions reserve three lines at
    0.76rem (44 names need >2 lines, e.g. "Gigantamax Urshifu (Rapid
    Strike)"); sprite→name gap 6px; Nidoran's ♀/♂ are wrapped in a
    `.gender-mark` span (system symbol font, `line-height: 1`) — check the
    baseline on the phone, it's a font-fallback quirk. Clicking a card
    opens a detail sheet (bottom sheet on phones, dialog on desktop) with
    the sprite, dex number, "form of …", and every category it counts for,
    grouped like the dropdowns; Esc/backdrop/× close it.
28. Stats: Answered and Accuracy are centred (headers and cells).
29. Black band under the nav: iOS 26 Safari leaves a strip between the
    layout viewport's bottom (where `position: fixed; bottom: 0` ends) and
    its floating toolbar, and paints the *canvas* (body background) there.
    theme-color didn't tint it (still black in the 11:17 screenshot), so
    `body` background is now the nav's surface colour (#1c1b20) and the page
    black is painted on `#root` (which fills the layout viewport) — nothing
    visible changes elsewhere. `theme-color` also stays #1c1b20. If the
    band is *still* black on device, Safari isn't showing the canvas there
    at all and the strip is Safari's own — nothing on our side can paint it.
30b. Detail card: centred dialog on all sizes (was a bottom sheet on
    phones), a fixed height (min(84dvh, 720px), not fit-to-content, so it
    doesn't jump between Pokémon); the page behind it can't scroll
    (`#root` overflow locked while open, backdrop `touch-action: none`). An open sheet is a
    trailing `pokemon-<slug>` hash segment (`useDetailHash`): opening
    pushes a history entry so Back closes it, ×/Esc/backdrop pop that
    entry so Back never reopens a closed sheet, a pasted or reloaded link
    opens it (only if the Pokémon is in that view — a stale slug is
    dropped), and switching tabs drops it. The `#` itself stays: GitHub
    Pages serves static files, so a real path would 404 on refresh. The
    sheet is portalled onto `<body>`: the tab roots' entry animation
    (`main > *`, a translate) made them the containing block for the
    fixed backdrop, so a sheet opened by a reload sat thousands of pixels
    down the Browse list for 200ms and then jumped into place. Three blocks divided by
    hairlines: header (one grid — plain sprite; dex line; the name with
    the region pill right after it; the type pills under the name with the
    group pills beside them, region and groups sharing a left-aligned
    column that starts right after the name column; only when that row
    wouldn't fit — the groups had to stack, or the header overflows:
    Koraidon/Miraidon on a phone — do the types drop under the sprite and
    span the left columns (measured in PokemonDetail, `.types-below`);
    when even that overflows (a long name beside "Mega Evolution") types
    and groups share one row across the header (`.tags-row`), and only
    then may the name itself wrap (`.name-wraps`). Header pills never
    wrap their text; the rows under the dex line run under the close
    button — identity, not rows), then
    Evolution, centred: a tree
    of square tiles (sprite, name, how), each joined by an arrow to its
    own evolutions — one arrow to a lone evolution, one shared arrow into
    a column where it branches (`evolutionTree`). In a branch, evolutions
    that go no further pack into vertical columns — one per generation
    when three or more span several (Eevee: the Kanto three, the Johto
    two, the Sinnoh two, Sylveon), else pairs — and ones that evolve
    again get a row each. The tree never wraps: laid out at its natural
    width and zoomed to fit the sheet (below) — Goomy shows Sliggoo → Goodra over
    Hisuian Sliggoo → Hisuian Goodra, Applin has Flapple/Appletun paired
    above Dipplin → Hydrapple. Tiles are all one size: 100px on a desktop
    (what the tallest content — a two-line name over a two-line method:
    Wormadam Sandy, Urshifu Rapid Strike — needs, so they're square) and
    76px on a phone; on any sheet every tile is as tall as that sheet's
    tallest (`useFitRows` sets `--evo-tile-h`), so tree and forms tiles
    match, and the section's rows are zoomed by one factor so the widest
    exactly fits the sheet — down as far as it takes (nothing scrolls
    sideways; the sheet scrolls down instead), up to 1.25× when there's
    room. A fade with a nudging chevron sits on the sheet's bottom edge
    while there's more below to scroll to (`.modal-more`).
    Methods stay under ~30 characters
    (`TERSE` overrides for the long dex lines) and are Title Case, small
    words aside (`titleCase`). A regional
    form that evolves from a different form (Koffing → Galarian Weezing,
    Pikachu → Alolan Raichu, the Hisuian evolutions) says "in Galar" etc.
    after the method (`evoWhere`) — the dex line alone reads the same as
    the usual form's — and the other branches whose sides share a line
    get what tells them apart (`NOTES`: Solgaleo/Lunala by version,
    Silcoon/Cascoon random, Wormadam by where Burmy last fought vs Mothim male), as do the gendered
    evolutions (Gallade male, Froslass/Salazzle/Vespiquen female). Every
    branch was audited: all 30 now read distinctly, Wurmple's coin toss
    aside (a test keeps it so). Under the tree, a **Forms** block
    (`forms.js`, `FormsRows`): the line's transformations — Mega,
    Gigantamax, Primal, Origin, Crowned, Necrozma's fusions, Hoopa
    Unbound, Zygarde, Calyrex riders, Ogerpon masks, Rotom appliances,
    Sky Shaymin, Therian Landorus, Pirouette Meloetta, Zen Mode, Castform,
    Deoxys, Ash-Greninja — laid out like the tree in one row: each stage
    that has any, then its forms stacked in pairs (Pikachu ⇢ Gmax, then
    Raichu ⇢ Mega X over Mega Y; Rotom's five in three columns), dashed
    tiles and a ⇢ arrow so they
    read as "becomes, for a while", each with its trigger (Mega Stones
    from Serebii's Legends: Z-A table, incl. Absolite Z, Garchompite Z,
    Lucarionite Z, Raichunite X/Y; Rayquaza's is Dragon Ascent). Variants
    that are different individuals — regional forms (already in the tree),
    Tauros breeds, Oricorio, Partner Pikachu, Bloodmoon Ursaluna … — are
    not forms of this kind. A test checks every transformation has a
    trigger; all 318 form tiles measured square. The 47 candidate forms
    the builder used to drop as "covered by the base" (Midnight/Dusk
    Lycanroc, Low Key Toxtricity, Black/White Kyurem, the Therians, Blade
    Aegislash, School Wishiwashi, Hero Palafin, Terapagos, Primal Kyogre,
    Speed Deoxys, Cramorant Gulping/Gorging, Own Tempo Rockruff — from which Dusk Lycanroc evolves …) are now written as
    `answer: false` records: `ALL_POKEMON` has them (trees, forms, the
    sheet, URL slugs), `POKEMON` — categories, Browse, Drill, Cards, Grid,
    Stats — doesn't; they're named PokeDoku-style from their form
    ("Lycanroc Midnight"), and their sprites are on PokeDoku's CDN too.
    Gender forms (Meowstic Male / Female, Oinkologne, Basculegion) are branches of the tree, "Lv 25, Male / Female". Every other form
    of a species — the *variants*: regional forms, Own Tempo Rockruff,
    Partner Pikachu, Oricorio's styles, Squawkabilly's plumages, Zarude
    Dada, the female Meowstic … — sits in the Forms row after ≈ (dotted
    tiles, a word on what it is: `variantNote`). The row (`formsRow`) is
    one flat, wrapping row in dex order, no connectors: the Pokémon itself
    (once, highlighted) and the forms that relate to it directly — the
    species base with its transformations and its variants; a variant with
    the base, the other variants and its own transformations; a
    transformation with its base, that base's other transformations and its
    counterparts (the same kind on the other variants: Zen / Galar Zen,
    Single Strike Gmax / Rapid Strike Gmax, Tatsugiri's three Megas —
    `formKind`, `counterpartsOf`). So Darmanitan lists Zen and Galarian
    Darmanitan (not Galar Zen); Zen lists Darmanitan and Galar Zen;
    Galarian Darmanitan lists Darmanitan and Galar Zen; Charizard Mega X
    lists Charizard, Mega X, Mega Y, Gmax; every Lycanroc lists all three.
    The row takes the tree's zoom so tiles match. A transformation's base is the variant
    whose form its own form extends (`baseOf`: Galar-Zen → Galarian
    Darmanitan, Rapid-Strike-Gmax → Rapid Strike Urshifu, Droopy-Mega →
    Droopy Tatsugiri), else the species. Tests keep the rows symmetric
    (whoever a sheet lists, lists it back), duplicate-free and free of the
    sheet's own Pokémon; every row and every tree was dumped and read
    through once by hand. Long
    one-word names (Meowscarada) shrink to fit a tile rather than break.
    Still absent, on
    purpose: cosmetic forms (Vivillon, Alcremie, Arceus/Silvally plates,
    caps, totems) and Cherrim Sunshine / Minior Meteor, which have no
    PokeAPI id of their own to hang a sprite on. Every tile carries a
    strip along its bottom edge in its type colours (split for a dual
    type) — the thing that changes along a line — and tapping a tile
    opens that Pokémon's own sheet, pushed on top: Back returns to the
    previous sheet, × closes them all (`useDetailHash` counts the depth
    in the history entry's state). Region stays in the header: it's the
    same on every tile of nearly every line.
    — then Abilities and Moves, each a small-caps label with its pills
    beneath (quieter, uniform pills). Not listed (still
    categories everywhere else): type count, tracked abilities, evolution
    method, stage and line — the header and tree already show them.

30. Records carry `evoItem` (the item an item evolution needs: used stone,
    held item, or held-while-trading item). Dex `evoItem` plus overrides for
    Linking Cord (Alakazam/Machamp/Golem/Gengar), Probopass (Thunder Stone),
    Kleavor (Black Augurite), Ursaluna (Peat Block), Alcremie ("a Sweet"),
    Urshifu (Scrolls), and `evoDetail`, a sentence composed from the dex's
    evoType/evoLevel/evoItem/evoMove/evoCondition ("Level 36", "Use a
    Water Stone", "Level up holding a Razor Claw at night", "High
    friendship at night", "Trade with a Shelmet") with overrides where the
    dex is terse (Linking Cord, magnetic-field/stone alternatives, Milotic,
    Sylveon, Shedinja, Melmetal). Shown on the answered Method card —
    "Item / Stone — Use an Ice Stone" — and in the detail sheet. Item and
    Stone stay separate options because PokeDoku has both categories
    (Stone ⊂ Item).

31. Stats: on phones Accuracy (header + bar + %) is right-aligned at the
    table edge and the bar is 36px, so it sits ~80px clear of the Answered
    number (the earlier phone bar override had lost to a later base rule).
    A "Reset stats" button now sits under the review tiles; with sync
    across several devices it becomes "Reset this device" + "Reset all
    devices" (the latter empties every block in the gist — other devices
    start over on their next sync). The old button at the very bottom is
    gone.

32. Cards now have a deck per Stats group: Region, Type (18 buttons, any of
    its types is right; Megas included when their type differs), Type
    Count, Evolution Method, Evolution Stage, Evolution Line (yes/no
    "branched?", only Pokémon that can evolve, biased to the few branched
    ones), Group (was "Special"), Move (yes/no "Can it learn X?" — one move
    per card, half the time one it does learn; recorded against that
    move's category), Ability (5 + None). Category labels are Title Case
    and the "Special" group is "Group" everywhere (dropdowns, Stats). Deck
    chips scroll horizontally on phones. Stats Answered/Accuracy are
    left-aligned like Category.

33. Cards: the following card is picked as soon as one is shown and its
    sprite preloaded (`session.next`), so Next/Skip swap name and picture
    together; the `<img>` is keyed by Pokémon so a stale sprite never
    lingers, and the flashcard sprite loads eagerly.

34. After a card is answered (right, wrong or Don't Know), region / type /
    group pills appear
    under the sprite (a "Regular" pill when the Pokémon is in no group —
    Bulbapedia's term for non-Legendary/Mythical); the row keeps its height
    when empty so the buttons never move. The Group deck's "None of these"
    is now "Regular"; "Give up" is "Don't know".

35. Full-app spacing/alignment pass (desktop 1280 + iPhone-size, every tab
    and state): grid row-header column widened so "Dual-Type" doesn't wrap;
    picking a grid cell scrolls its answer panel into view above the phone
    nav; all buttons/headings/sub-headings Title Case ("Don't Know" in
    Drill too, "Next Question", "Valid Answers", "New Grid", "Reveal This
    Cell", "Spaced Review", "Cross-Device Sync", "Sync Now", "Link Another
    Device", "Reset Stats", …); Ability deck "None of These".

36. Records carry `abilityList` (every ability, hidden/special ones
    marked). The answered card shows "Abilities: … (hidden)" under the
    answer line, and the detail sheet lists them. After answering, only the
    correct option(s) — plus a wrong pick, in red — remain, centred in the
    same reserved area. No "Regular" pill for Pokémon in no group. Sprites
    are bottom-aligned (PokeAPI draws each Pokémon at its own height in the
    canvas; floating ones will still sit higher — that's the artwork).

37. Cards layout: bigger question with more room above it; the name sits
    right under the sprite (the pill row only takes space once answered);
    sprite/pills/name/answer/abilities live in a fixed-height block so the
    buttons never move; on phones the Cards tab fills the screen and the
    answer buttons + Skip/Don't Know are centred in the space under the
    Pokémon (`.app`/`main`/`.flashcards` flex column, `.answer-area` flex:1).
    Evolution Line question shortened to one line ("Does this Pokémon have
    a branched evolution?"). Phone bottom padding trimmed to nav + 12px.

38. Phone cards scaled up: the option grid had shrunk to its content
    (auto side margins inside a flex column) — now `width: 100%`. Type deck
    is 5 columns × 4 rows on phones so the reserved area is 4 rows of 44px;
    sprite 112px, question 1.1rem, name 1.05rem. Questions shortened to one
    line at that size ("Which region is this Pokémon from?", "How did this
    Pokémon evolve?", …). Skip and Don't Know share a 150px min width.

39. Phone cards no longer reserve a block under the name: 148px sprite,
    name right under it, options centred in the rest; once answered the
    option list collapses to the right answers (no reserved rows) and the
    pills/answer/abilities lines take that room. Positions still match
    across decks/cards while unanswered; between unanswered and answered
    the layout reflows (Next Card sits under the remaining option). Desktop
    keeps the fixed-height block. Verified no scrolling in either state
    across all nine decks at the Safari-sized viewport.

40. Type and Region decks are multi-select: tap to toggle, then **Check**;
    right only when the selection matches exactly (both types of a dual
    type; both regions of a dual-region form). Wrong picks show red, missed
    right answers show as a dashed green outline. The in-progress selection
    survives tab switches. Evolution Method is multi-select too, with
    implied picks (Stone ticks Item, Friendship ticks Level-Up) since those
    pairs always go together in the data. Other decks stay single-tap.

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

## Browse

41. Both dropdowns start blank (a blank option, not "— none —"), which
    lists every answer; one category filters, two intersect. The hash
    carries only what's picked (`#browse`, `#browse/type-fire`,
    `#browse/region-kanto/type-fire`). A search box under the dropdowns
    narrows the current list by name — display name, the dataset's own
    name and the dex slug, like the answer boxes — and isn't in the hash.
    Long lists render in batches of 60 (`AnswerList`, an
    IntersectionObserver sentinel 600px ahead), so the everyone list
    doesn't lag the tab.

## Names

42. PokeDoku names base species by their form where it has several
    ("lycanroc-midday", "toxtricity-amped", "meowstic-male",
    "deoxys-normal", "wormadam-plant", "basculin-red-striped"), and its
    answer list carries its hidden forms too ("lycanroc-midnight",
    "rockruff-own-tempo"). `build-pokedoku-names` now writes every record
    whose PokeDoku name carries a form (326, none missing) and pokedex.js
    applies them to base species as well — "Lycanroc Midday" on the sheet,
    in the tree and in the Forms row alike; the plain name stays as
    `altName` (search, Drill answers) and `speciesName` (what the Forms
    row strips to label a form "Midnight").
