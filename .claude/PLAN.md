# Feature plan — from the 2026-08-25 notes

Review of the feature notes against the codebase, with the implementation
plan and the assumptions made. Batches 1–5 are implemented (each with a
multi-agent review pass and headless-Chrome verification); their sections
below are trimmed to what still matters. Batch 6 remains.

## Answers to the questions in the notes

### How do other sites restrict horizontal scrolling / hide the scrollbar?

Two separate mechanisms, both in place here:

- **The page never scrolls sideways**: `overflow-x: hidden` on `body`
  (App.css) — kept as `hidden`, not the newer `clip`: `clip` is dropped
  by pre-16 Safari (leaving no guard at all) and subtly changes root
  overflow propagation, for no visible gain over what already worked.
- **Intentional horizontal scrollers hide their bar**: `scrollbar-width:
  none` + `::-webkit-scrollbar { display: none }` on the scroller (the
  evolution tree; the phone deck-chip row — the desktop chips wrap, so
  no bar there).

### Are mega/gmax available for type/group/move/ability questions?

All data-driven, checked against `pokedex.json`: the Type deck asks the
19 Megas whose type differs; the Ability deck the 14 whose tracked
abilities differ; Gmax are excluded from Type/Move/Ability decks and
both from Group — correctly, since **no Gigantamax changes type vs its
base** and **all 34 Gmax records have zero tracked moves** (PokeAPI
lists none). In Drill/Grid, mega/gmax are full members of the
type/group/move/ability pools. No change needed. (The new Matchup deck
follows the same rule: Gmax share their base's weaknesses, so they are
never asked; type-changing Megas are.)

## Shipped (batches 1–5)

- **Batch 1**: Grid/Drill tabs swapped; Stats footer reduced to "Site
  built"; red sliver on all-miss accuracy bars (`min-width` keeps tiny
  percentages visible; red keyed on `c === 0`, not the rounded %);
  Browse picker/search spacing; the grid Categories panel is a div (a
  `<legend>` clips); evo shorts read "Evolved by X" (the Method deck
  keeps its own terse button labels); ‹ sits above the Skip row, glued
  to it via `.card-controls` (with a short-viewport budget: ≤700px
  screens shrink the card sprite and options back).
- **Batch 2**: grid cells blur on popup close, tap-again deselects, and
  a `click` outside the tab's own subtree (ref-contained; portals
  excepted) clears a filled cell's lingering selection; card option
  buttons grew (48px/10px gap desktop, 46px/8px phone); **Undo on
  Cards** — one-deep, keyed to the card (`session.undo = {token, key}`),
  App keeps `{token, before, after}` and refuses unless the current
  block IS `after` (structurally self-invalidating; `clearUndo` on
  reset/merge; `blockRef` refreshed so a racing sync can't upload the
  undone attempt); Undo survives Back/Next navigation and hides itself
  the moment any newer attempt lands anywhere.
- **Batch 3**: `data/typechart.ts` (Gen 6+, 51/61/8 pinned by test,
  memoized `weaknessesOf`); **Matchup deck** (weaknesses multi-select,
  records no categories); **Name deck** (typed answer via autocomplete,
  mystery card hides caption/alt/title, grades like Drill); **per-deck
  filters** (region/type/method/group/move/ability; any-overlap
  semantics — "Stone only" keeps stone evolvers, ability filters skip
  None-of-These Pokémon; the Move deck filters the asked move; pools
  fall back per-deck: recent-exclusion first, filter last, so All never
  loses a deck; stats stay unfiltered); **Combo deck** (`COMBOS`
  strings, per-group sections, union options derived from sub-decks,
  exact-match across the union, stale stored params fall back safely).
- **Batch 4**: pills are buttons that jump to Browse (`jumpToBrowse` +
  synthetic hashchange; a type pill carries the whole typing); Browse
  holds up to **three** filters (`intersectAll`, `canJoin`, greedy
  `keepValid` with the edited slot winning; pickers disable options that
  can't join all partners); **fun Browse-only categories** ("Pikachu
  Clone" manual list — 12 species, test-pinned; "Changed Type Evolving";
  "Form With New Type") under a `browseOnly` flag with derived
  `QUIZ_CATEGORIES`/`QUIZ_CATEGORY_GROUPS` keeping them out of
  Drill/Grid/Stats (they DO show on detail sheets — deliberate:
  discovery surface); **tappable Stats review tiles** — the Flashcards
  row's Due/Learning/Mastered/New open a sorted, batched card list
  (deck + when due), rows open the detail sheet.
- **Batch 5**: wrong guesses in Drill and the Grid popup render as a
  red-tinted tile ("Why Not?") that expands into the detail sheet
  (modal shells now nest — only the outermost freezes scroll; Escape
  peels one layer); **pick % fallback**: PokeDoku's stats endpoints are
  401 without login (probed 2026-08-25), so uniqueness is local — Drill
  says "one of N valid answers", a correct Grid fill adds how many other
  cells of this board the pick could also have filled.

### Open design notes from the reviews

- Per-deck filters are deliberately scoped to their own decks: a Region
  filter does NOT constrain the Combo deck's region section, and
  Matchup/Name aren't filterable. If that feels wrong in use, the next
  step is propagating each sub-deck's filter into Combo's pool/param
  choice — ask before building.
- The "New" review count now includes the Matchup/Name/Combo pools
  (they're real cards), so it is much larger than before.
- Drill/Grid could reuse the Cards Undo hook (`undoLastAttempt` is
  already generic) if misclicks show up there too.

## Batch 6 — Google sign-in (large; NOT started, per instruction)

- Recommended: **Firebase Auth (Google provider) + Firestore**, free
  Spark tier. Why not Drive `appDataFolder`: GIS browser tokens last
  ~1h and silent refresh degrades into consent popups — bad for a PWA
  syncing in the background.
- Shape: one Firestore doc per uid per device block
  (`users/{uid}/blocks/{deviceId}`), mirroring today's block-per-device
  model so `mergeBlocks`/`absorbBlock` carry over; security rules
  restrict to `request.auth.uid`. A new `logic/firebaseSync.ts`
  implements the same interface as `logic/sync.ts`; the QR handoff
  disappears (sign in on each device instead).
- Migration: on first sign-in, if a gist token exists, import the merged
  gist blocks then offer to disconnect the PAT. Keep the gist path for a
  release or two behind "legacy".
- Costs/assumptions: a Firebase project + public config keys in the
  repo, the app's first backend dependency, origin whitelisting — and
  the user must create the Firebase project (console access).
