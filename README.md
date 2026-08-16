# PokeDoku Study

A study app for [PokeDoku](https://pokedoku.com): learn every category
Pokémon fall into — all 18 types, mono/dual typing, the ten regions of
origin, evolution methods and stages, and the special groups (Legendary,
Mythical, Ultra Beast, Paradox, fossil, starter lines, babies, Mega,
Gigantamax) — 47 categories over all 1025 Pokémon plus the alternate
forms PokeDoku accepts as their own answers (regional variants, Megas,
Rotom appliances, …) whenever they fit a cell the base species doesn't.

## Modes

- **Browse** — pick one category, or a pair like a PokeDoku cell, and see
  every Pokémon that qualifies.
- **Drill** — the core PokeDoku skill: given two categories, name any
  Pokémon that fits both. Every answer reveals the full list of valid
  answers, which is where the learning happens.
- **Cards** — region flashcards: see a Pokémon, answer where it's from.
- **Grid** — a full 3×3 practice board, generated so every cell is
  solvable with distinct Pokémon.
- **Stats** — per-category accuracy, weak spots highlighted.

Questions are weighted toward what you get wrong. Before any history
exists they're pre-biased toward Gen 5+ regions (Unova, Kalos, Alola,
Galar, Hisui, Paldea).

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
few minutes.

Answered flashcards and drill pairs are spaced: correct answers push the
next review out (10 min → 1 → 3 → 7 → 16 → 35 → 80 → 180 days) and a
miss resets to 10 minutes; due items are weighted up, mastered ones
fade out.

## Development

```
npm install
npm run dev     # local dev server
npm test        # dataset invariants + logic tests
npm run lint
npm run build
```

Pushes to `main` deploy to GitHub Pages via `.github/workflows/deploy.yml`.

## Dataset

`src/data/pokedex.json` is generated — do not hand-edit. It derives from
[@pkmn/dex](https://www.npmjs.com/package/@pkmn/dex) (Pokémon Showdown's
data), plus hand-maintained lists in `scripts/manual-lists.mjs` for
membership the dex data doesn't encode (Ultra Beasts, Paradox, fossils,
starter lines, babies, Hisui origins, which alternate forms get a record
and their PokeAPI ids, and a few evolution-method overrides). To regenerate:

```
npm install --no-save @pkmn/dex
npm run build-data
```

The build script validates counts (1025 species, per-generation totals,
group sizes) and known facts (Alakazam evolved by trade, Wyrdeer is from
Hisui, …) and refuses to write if anything is off. Sprites are loaded at
runtime from [PokeAPI sprites](https://github.com/PokeAPI/sprites).

Notes on judgment calls:

- "Evolved by X" means the Pokémon itself evolved that way (Vaporeon
  counts for item, Eevee doesn't).
- Single-stage Pokémon are their own stage — they don't count as "final".
- Starters cover the whole line (81), excluding the Let's Go partners.
- "Has a Mega" includes the Legends: Z-A Megas (87 species).
- Regions follow PokeDoku's "How to play": regional forms count only for
  the region they debuted in (Growlithe is Kanto, Hisuian Growlithe is
  Hisui); Mega forms count for the base species' region; any other form
  that debuted elsewhere counts for *both* (White-Striped Basculin is
  Unova and Hisui, Origin Dialga is Sinnoh and Hisui, Bloodmoon Ursaluna
  is Hisui and Paldea). Records carry `region` (debut) and `regions` (all
  that count). Primal forms are not Megas and stay in Hoenn. Only the
  seven Legends: Arceus originals are Hisui *species*.
- A form only gets its own record when it can answer some cell its base
  species can't (a new type, type count, region, stage, method, or flag).
  Mega Charizard X (Fire/Dragon) is in; Mega Charizard Y and Gigantamax
  forms are covered by the base record. Form ids are PokeAPI's, so the
  same id keys sprites, stats, and PokeDoku's own list.
