# Feature plan — from the 2026-08-25 notes

Review of the feature notes against the codebase, with the implementation
plan and the assumptions made. Batches 1–5 are implemented (each with a
multi-agent review pass and headless-Chrome verification); their sections
below are trimmed to what still matters. Batch 6's code is implemented;
only its console setup and live verification remain.

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

## Batch 6 — Google sign-in (code implemented 2026-08-25; console setup pending)

**Status**: steps 1–4 below are done and verified (typecheck, lint,
110-test suite incl. 8 new cloudSync tests, production build, and
headless-Chrome screenshots of all three SyncPanel states with a dummy
config). `src/logic/firebaseConfig.ts` ships blank, so the deployed
site keeps today's token-only UI until the console setup below is done
and the config pasted in; then step 5's live verification (sign in on
two devices, absorb, reset-all, quota check) closes the batch. One
deliberate deviation from the plan: a "Forget Old GitHub Token" button
in the Google-connected state covers both a declined migration offer
and a failed gist read, instead of silently stranding the PAT.

Replace the PAT-in-localStorage gist sync with "Sign in with Google":
**Firebase Auth (Google provider) + Cloud Firestore**, free Spark tier.

### Why this stack (decision + rejected alternatives)

- **Firebase Auth** keeps a long-lived refresh token in IndexedDB
  (`browserLocalPersistence`, the default) and silently mints ID tokens
  forever — sign in once per device, never again. That is exactly what
  the PAT provided, minus the manual token ceremony.
- **Rejected — Drive `appDataFolder` + Google Identity Services**: GIS
  browser access tokens last ~1h and silent refresh degrades into
  consent popups; background re-pulls (every 5 min while visible) would
  strand on an expired token. No server-side refresh is possible for a
  static site.
- **Rejected — Supabase**: also viable (Google OAuth + Postgres + RLS),
  but heavier concepts for this shape of data and no offline story we'd
  use; Firebase's per-uid subcollection + two-line rules is a closer
  fit. Revisit only if Firebase pricing/terms change.
- **SDK flavor**: `firebase/firestore/lite` (REST, no realtime, no
  offline cache — much smaller than full Firestore). Our sync is
  poll-based (10s debounce push, 5-min visible re-pull), localStorage
  stays the source of truth, and failures already surface as
  `syncState.status === "error"`; realtime listeners and the offline
  cache buy nothing. Lite still has `getDocs`/`setDoc`/`deleteDoc`/
  `writeBatch`, which is all we need.
- **Sign-in flow**: `signInWithPopup` on all platforms. Do NOT use
  `signInWithRedirect`: it is broken-by-default on Safari 16.1+/iOS
  (third-party storage partitioning) unless the auth handler is proxied
  onto our origin, which GitHub Pages can't do. Popup works in iOS
  Safari and in installed-PWA standalone mode (opens an in-app sheet).
- **Bundle**: `firebase/app` + `firebase/auth` + `firebase/firestore/lite`
  is still real weight (~100KB+ gz). Load it **only** via dynamic
  `import()` from a small always-loaded shim, triggered by (a) a stored
  "google" provider flag at startup or (b) the Sign In button. Users who
  never sign in download none of it.

### Data model

One doc per device block: `users/{uid}/blocks/{deviceId}` (deviceIds
are `[a-z0-9]{8}` from `stats.randomId`, safe as doc ids). Doc content:

```
{ json: JSON.stringify(statsBlock), updatedAt: serverTimestamp() }
```

Store the block as **one JSON string field**, not expanded maps:
Firestore field paths choke on arbitrary map keys (pair keys contain
`|` today and nothing guarantees future category ids avoid `.`/`/`),
and we never query inside a block — we always read it whole. The 1 MiB
doc limit is far above a block's realistic size (tens of KB; the
per-device block is the same payload the gist file held for ALL
devices). `updatedAt` is metadata for debugging/inspection only — merge
semantics stay purely `mergeBlocks`' additive/last-writer-by-`t` logic.

This is strictly better than the gist under concurrency: today every
device PATCHes the whole shared file (real lost-update window between
read and write); per-device docs make each device's write touch only
its own doc, so the race disappears rather than carries over.

Operation mapping (replaces `findGistId` + file read/write):

- `syncBlock`: `getDocs(users/{uid}/blocks)` → parse each `json` →
  `setDoc` own doc only if remote copy differs (keeps the no-churn
  property) → return all blocks.
- `resetRemoteBlocks`: one `writeBatch` — delete every other device's
  doc, set own fresh doc.
- `removeDeviceBlock`: `writeBatch` — delete the absorbed device's doc,
  set own (post-absorb) doc.
- A block whose `json` fails to parse is skipped (mirror of today's
  corrupt-file `catch` → rebuilt from local on next write).

### Security rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/blocks/{deviceId} {
      allow read, write: if request.auth != null
        && request.auth.uid == uid
        && (request.method == 'delete'
            || (request.resource.data.json is string
                && request.resource.data.json.size() < 900000));
    }
  }
}
```

Everything else is denied by default. The size guard keeps a bug from
writing unbounded docs.

### New/changed modules

- **`src/logic/firebaseConfig.ts`** (new): the public web-app config
  object, committed to the repo (these keys are not secrets; access
  control lives in the rules). One TODO-filled placeholder until the
  console setup below happens.
- **`src/logic/cloudSync.ts`** (new): everything Firebase. Exposes the
  same operation surface as `sync.ts` (`syncBlock`,
  `resetRemoteBlocks`, `removeDeviceBlock`) plus `signIn()`,
  `signOutGoogle()`, `onAccountChanged(cb)` (wraps
  `onAuthStateChanged`; reports `{uid, email, displayName} | null`).
  Internally dynamic-imports the firebase modules on first use and
  caches the app/auth/db handles. Firestore calls go through a thin
  injectable backend object so tests can stub it (the module-level
  seam mirrors how `sync.test.ts` stubs global `fetch`).
- **`src/logic/sync.ts`** (kept, legacy): untouched behavior, reached
  only when a PAT is present.
- **`src/StatsContext.ts`**: `token: string` / `saveToken` generalize to
  an account model:
  `account: { provider: "gist" } | { provider: "google"; email: string } | null`,
  plus `connectGoogle()`, `disconnect()`, and legacy `saveToken` kept
  while the gist path lives. `SyncState` unchanged.
- **`src/App.tsx`**: provider selection — a `provider` value derived
  from stored state (`"google"` if a stored flag
  `pokedoku-study:sync-provider` says so and auth restores a user,
  `"gist"` if `getToken()`), and every call site (`syncNow`, `resetAll`,
  `absorbDevice`) dispatches to `cloudSync` or legacy `sync` through one
  small `providerOps` object rather than scattered conditionals. The
  debounce/re-pull/in-flight/undo machinery is provider-agnostic and
  does not change.
- **`src/components/StatsView.tsx`** SyncPanel states:
  1. **Signed out, no PAT**: primary "Sign in with Google" button +
     one-line pitch; the PAT input moves into a collapsed
     `<details>` "Legacy: connect with a GitHub token".
  2. **Google connected**: status line (dot + synced/tracking, as
     today) + the account email; actions: Sync Now, Devices, Sign Out.
     **No QR handoff** — linking another device = sign in there. The
     QR code path (`handoffUrl`/`LinkDeviceQR`) stays gist-only.
  3. **Gist connected (legacy)**: today's UI unchanged, plus a hint
     "Google sign-in is the new way — sign in to migrate" with a
     button that runs sign-in + migration.
  Error copy: replace "Check the token's Gists permission." with a
  provider-appropriate message for the Google path.

### Migration (PAT → Google), per device

On a successful sign-in **while a gist token exists** on this device:

1. Pull all gist blocks (legacy `syncBlock` with the current local
   block).
2. For each gist block, write it to Firestore **only if no doc for that
   deviceId exists yet** — Firestore is always fresher than the gist
   copy once a device has migrated, so never overwrite. (Own block is
   exempt: it syncs normally right after.)
3. Offer to disconnect the PAT on this device (`setToken("")`); keep
   the gist itself — other un-migrated devices may still be writing to
   it, and it's the user's data to delete.

A device that migrated later than its siblings just imports whatever
the gist still uniquely holds (its own history included) — additive
merge semantics make the order safe. Remove the whole legacy path
(sync.ts, QR handoff, PAT UI, migration) after a release or two of
overlap.

### One-time console setup (user task — needs the Firebase console)

1. Create a Firebase project (Analytics off).
2. Authentication → Sign-in method → enable **Google** (pick the
   support email; Firebase provisions the OAuth client itself).
3. Firestore → create database, production mode, region close to home
   (e.g. `europe-west` or wherever's nearest).
4. Paste the security rules above (Rules tab).
5. Authentication → Settings → Authorized domains → add
   `izaankml.github.io` (`localhost` is pre-authorized for dev).
6. Project settings → add a Web app → copy the config object into
   `firebaseConfig.ts`.

### Implementation order (each step leaves the app shippable)

1. **Refactor seam**: introduce the `providerOps` dispatch +
   account-shaped context with gist as the only provider. Pure
   refactor; all existing tests stay green.
2. **`cloudSync.ts` + unit tests**: stubbed-backend tests covering the
   op mapping (differ-check before write, batch delete+set shapes,
   corrupt-`json` skip, import-only-missing migration rule) — mirror
   `sync.test.ts`'s style.
3. **UI**: SyncPanel three states, App wiring, dynamic-import gating.
   Verify signed-out + legacy states with the run-app skill
   (headless Chrome can't drive a real Google popup).
4. **Migration** flow + legacy gating/copy.
5. **Console setup, deploy, live verification**: sign in on desktop +
   phone, confirm both devices appear in Devices, absorb a stale one,
   reset-all, and confirm the Spark quotas dashboard shows the
   expected trickle (re-pull = N doc reads / 5 min visible; well
   inside 50K reads/20K writes per day).

### Risks / open questions (flag, don't block)

- **Popup blockers**: `signInWithPopup` must be called directly in the
  click handler (no awaits before it) or Safari blocks it.
- **firestore/lite has no offline queue**: a sync while offline fails
  fast → `status: "error"`, retried by the existing debounce/re-pull.
  Same behavior the gist path has today; acceptable.
- **Third-party storage**: popup auth uses an iframe helper on
  `<project>.firebaseapp.com`; current SDK handles Safari partitioning
  for popup (it's redirect that's broken). If sign-in proves flaky on
  iOS in practice, the fallback is serving `authDomain` off a custom
  domain — a bigger change, note only.
- **Multiple Google accounts**: signing into a different account mid-
  life creates a fresh empty uid namespace — the UI shows the signed-in
  email precisely so this is visible. No account-linking work planned.
- Delete-the-gist after all devices migrate: leave manual (user's
  call), maybe a hint in the legacy panel.
- Apple/other providers: out of scope; the account model in the
  context is shaped so a second provider slots in if ever wanted.
