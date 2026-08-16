# PokeDoku Study

A study app for [PokeDoku](https://pokedoku.com): learn every category
Pokémon fall into — all 18 types, mono/dual typing, the ten regions of
origin, evolution methods and stages, and the special groups (Legendary,
Mythical, Ultra Beast, Paradox, fossil, starter lines, babies, Mega,
Gigantamax) — 47 categories over all 1025 Pokémon.

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
personal access token with only the **Gists** read/write permission and
paste it on each device. Each device writes only its own stat block, so
devices never overwrite each other; displayed stats are the sum of all
blocks.

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
starter lines, babies, Hisui origins, and a few evolution-method
overrides). To regenerate:

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
- "Has a Mega" includes the Legends: Z-A Megas (85 species).
- Regional forms don't relocate a species (Growlithe is Kanto; only the
  seven Legends: Arceus originals are Hisui).
