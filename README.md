# PokeDoku Study

A study app for [PokeDoku](https://pokedoku.com): learn every category
Pokémon fall into — all 18 types, mono/dual typing, the ten regions of
origin, evolution methods, stages and branching, the special groups
(Legendary, Mythical, Ultra Beast, Paradox, fossil, first partners,
babies, Mega, Gigantamax), the moves and abilities PokeDoku asks about —
77 categories over all 1025 Pokémon plus every alternate form PokeDoku
lists as an answer of its own (regional variants, Megas, Gigantamax,
Rotom appliances, Lycanroc's three, the female Pyroar, …).

## Modes

- **Browse** — every Pokémon, or pick one category, or a pair like a
  PokeDoku cell, and see who qualifies; each category picker opens a
  searchable list (type "galar", "stone", "earthquake"; tapping the chosen
  one again clears it), and a search box narrows the list by
  name. Tap any Pokémon (here or in a Drill/Grid
  answer list) for its detail sheet: every category it counts for, its
  abilities (hidden one marked), its whole evolution line with how each
  stage evolves (tap a stage for its own sheet; a Pokémon that doesn't
  evolve is a line of one), and the line's Mega,
  Gigantamax and other transformations with what triggers them — dotted
  tiles for the ones that last a battle (Mega, Gigantamax, an ability's
  form), solid for the rest (regional forms, Rotom's appliances). A form is
  an answer exactly when PokeDoku lists it as one; the few it hides
  (Cramorant's battle forms, Minior's colours) are in the data only so the
  sheet can draw a whole line.
- **Drill** — the core PokeDoku skill: given two categories, name any
  Pokémon that fits both. A miss says why ("Pikachu doesn't fit — it isn't
  Fire-type and isn't from Galar"), and every answer reveals the full
  list of valid answers, which is where the learning happens.
- **Cards** — flashcards, one deck per category group (or all at once):
  region, type, evolution method/stage/line, group, moves ("can it learn
  Earthquake?"), abilities. (No type-count deck — naming both types already
  says mono or dual — and the Group deck only asks about Pokémon that are
  in a group.) Pick, then Submit; Type, Region and Evolution Method want
  every answer (both types of a dual type; Stone implies Item and
  Friendship implies Level-Up). Skip or Don't Know on a card. Once
  answered, the card shows the Pokémon's types, region, group and
  abilities, and tapping it opens the detail sheet. ‹ steps back through
  the last 30 cards as they were left (answered ones stay answered); Next
  returns. The Region deck skips regional forms, whose names give the
  answer away. Tapping the deck in play again goes back to All. Keyboard:
  arrows move over the options, Space picks, Enter submits / moves on.
- **Grid** — a full 3×3 practice board, generated so every cell is
  solvable with distinct Pokémon; wrong guesses say why. Correct picks
  show an estimated global pick percentage — how many PokeDoku players
  would reach for that Pokémon in that cell — and a finished board gets
  a PokeDoku-style uniqueness score out of 900. The estimates come from
  PokeDoku's real daily pick counts, harvested nightly into
  `src/data/pick-stats.json` (`npm run harvest`, run by a scheduled
  GitHub Action) and averaged into a per-Pokémon pick tendency.
- **Stats** — per-category accuracy, weak spots highlighted (Mono-/Dual-
  Type have no table there — the type rows say it all — but still count
  for Drill and Grid); spaced-review counts; cross-device sync.

Questions are weighted toward what you get wrong. Before any history
exists they're pre-biased toward Gen 5+ regions (Unova, Kalos, Alola,
Galar, Hisui, Paldea).

Where you are survives a reload: the tab and its state live in the URL
hash (`#cards/region`, `#browse/type-fire/flag-legendary`,
`#drill/type-fire/flag-legendary`), as does an open detail sheet
(`#browse/region-kanto/pokemon-eevee` — Back closes it), and the current
flashcard and the Grid board in progress are kept in `localStorage`. Pokémon are named the
way PokeDoku names them ("Zapdos Galar", "Charizard Mega X", "Pikachu
Partner" — and base species by their form where PokeDoku does: "Lycanroc
Midday", "Toxtricity Amped", "Meowstic Male"); the conventional names
("Galarian Zapdos", "Lycanroc") still work in search.

## Cross-device sync

Progress lives in `localStorage`. To share it between devices, the Stats
tab can store progress in a private GitHub Gist: create a fine-grained
personal access token with only the **Gists** read/write permission,
paste it once, then use **Link another device** to move it to your other
devices by QR code (the code encodes the app URL with the token in the
`#fragment`, which never reaches a server). Each device writes only its
own stat block, so devices never overwrite each other; counts are summed
across blocks and review schedules take the most recent answer. Open
tabs re-pull other devices' progress when they regain focus and every
few minutes. Every browser or home-screen app that syncs keeps its own block; the Stats tab lists them and can merge a stale duplicate into the current device.

Answered flashcards and drill pairs are spaced: correct answers push the
next review out (10 min → 1 → 3 → 7 → 16 → 35 → 80 → 180 days) and a
miss resets to 10 minutes; due items are weighted up, mastered ones
fade out.

## Development

```
npm install
npm run dev        # local dev server
npm test           # dataset invariants + logic tests
npm run typecheck  # tsc over the app (tsconfig.app.json) and the scripts (tsconfig.node.json)
npm run lint
npm run build      # typecheck, then vite build
```

The app is TypeScript throughout (`src/`, `scripts/`, the Vite config):
strict mode, `.ts`/`.tsx` extensions on relative imports, and the dataset's
shape spelled out once in `src/data/types.ts`. The scripts run directly on
Node 22.18+ / 24 (`node scripts/build-dataset.ts`) through its native type
stripping, so they stay to erasable syntax (no enums or namespaces).

Pushes to `main` deploy to GitHub Pages via `.github/workflows/deploy.yml`.

## Dataset

`src/data/pokedex.json` is generated — do not hand-edit. It derives from
[@pkmn/dex](https://www.npmjs.com/package/@pkmn/dex) (Pokémon Showdown's
data), plus hand-maintained lists in `scripts/manual-lists.ts` for
membership the dex data doesn't encode (Ultra Beasts, Paradox, fossils,
starter lines, babies, Hisui origins, which alternate forms get a record
and their PokeAPI ids, and a few evolution-method overrides). To regenerate:

```
npm install --no-save @pkmn/dex
npm run build-data
```

The build script validates counts (1025 species, per-generation totals,
group sizes) and known facts (Alakazam evolved by trade, Wyrdeer is from
Hisui, …) and refuses to write if anything is off. Each record also
carries `prevo`, the record it evolved from, which draws the evolution
lines.

Two more generated files sit beside it, both keyed by the same PokeAPI
ids and refreshed with `npm run build-sprites` / `npm run build-names`
whenever records are added:

- `src/data/sprites.json` — which sprite to show and the visible box
  inside it. Sprites are PokeDoku's own 96×96 pixel art (its CDN; the art
  you see in the game, with truer colours than the fan sprites elsewhere
  for Gen 6+), PokeAPI's as the fallback — and first for the couple of
  entries PokeDoku draws in another style (Ash-Greninja, Own Tempo
  Rockruff: 128px renders that look blurry beside pixel art). Every sprite is normalised to
  fill its slot (a Charmander no longer sits as a speck beside its
  Gigantamax), which needs each sprite's bounding box; PokeDoku's CDN
  sends no CORS headers, so the boxes are measured here at build time
  rather than on a canvas at runtime.
- `src/data/pokedoku-names.json` — PokeDoku's name slug for every
  alternate form, from its public answer list, so forms are displayed
  the way PokeDoku shows them.

Notes on judgment calls:

- "Evolved by X" means the Pokémon itself evolved that way (Vaporeon
  counts for item, Eevee doesn't), and a Pokémon counts for every method
  that works in some core game: Alakazam is trade *and* item (Linking
  Cord), Crobat is friendship *and* level, Steelix is trade *and* item
  (held Metal Coat). "Stone" is the subset of item where an evolution
  stone is used. Kingambit/Gholdengo are level (their items aren't
  used); Sirfetch'd, Runerigus and Wyrdeer count for nothing. Item
  evolutions record the item (`evoItem`).
- Evolution is form-aware: Kantonian Farfetch'd, Corsola, Qwilfish and
  Red-Striped Basculin have no evolution line (their evolutions belong to
  regional forms); Kantonian Mr. Mime and Linoone are final stage. Both
  Gimmighoul forms evolve into Gholdengo and a male Burmy of any cloak
  becomes Mothim (`otherPrevos` carries the further pre-evolutions);
  Eternal Flower Floette doesn't evolve, and Mega Floette is its (form
  `Eternal-Mega`), not Floette's.
  "Not fully evolved" = first or middle stage. "Branched" = can evolve
  into different species (Eevee, Scyther, Cosmoem — not Rockruff, whose
  Lycanroc forms are one species).
- Mega Evolution and Gigantamax are answered by the Mega/Gigantamax form
  records (Mega Charizard X, Gigantamax Charizard), not the base species —
  PokeDoku lists them as separate answers ("MEGA_EVOLVED"/"GMAX_FORM").
  Those forms have no evolution categories, keep Legendary/Mythical/
  Fossil, but are not first partners. Primal forms are not Megas.
- First partners cover the whole line (81 species) plus the Hisuian
  starters and the Let's Go Partner Pikachu/Eevee, which are their own
  no-evolution-line records.
- Meltan and Melmetal have no region (Pokémon GO / Let's Go).
- Move categories mean "can learn the move" in some core game by any
  method except events; forms that change from another (Rotom-Wash) also
  learn what that form learns; Gigantamax forms have no moves.
- Regions follow PokeDoku's "How to play": regional forms count only for
  the region they debuted in (Growlithe is Kanto, Hisuian Growlithe is
  Hisui); Mega forms count for the base species' region; any other form
  that debuted elsewhere counts for *both* (White-Striped Basculin is
  Unova and Hisui, Origin Dialga is Sinnoh and Hisui, Bloodmoon Ursaluna
  is Hisui and Paldea). Records carry `region` (debut) and `regions` (all
  that count). Primal forms are not Megas and stay in Hoenn. Only the
  seven Legends: Arceus originals are Hisui *species*.
- A form only gets its own record when it can answer some cell its base
  species can't (a new type, type count, region, stage, method, flag, move
  or ability). Kyurem-Black or Lycanroc Midnight add nothing and are
  covered by the base record. Form ids are PokeAPI's, so the same id keys
  sprites, stats, and PokeDoku's own list.
- `scripts/check-against-helper.ts` diffs the dataset against
  [pokedoku-helper.com](https://www.pokedoku-helper.com)'s PokeAPI-derived
  data; everything but a few dozen move entries (PokeAPI's Mega move lists
  are patchy) agrees.
