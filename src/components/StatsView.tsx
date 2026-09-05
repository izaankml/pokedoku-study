import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { useStats } from "../StatsContext.ts";
import type { DeviceInfo } from "../StatsContext.ts";
import { handoffUrl } from "../logic/sync.ts";
import { preloadCloud } from "../logic/cloudSync.ts";
import { QUIZ_CATEGORIES, getCategory } from "../data/categories.ts";
import type { Category, CategoryGroup } from "../data/categories.ts";
import type { MergedStats, StatEntry } from "../logic/stats.ts";
import { allValidPairs, pairKey } from "../logic/matching.ts";
import { scheduleSummary } from "../logic/schedule.ts";
import type { ScheduleStatus, ScheduleSummary } from "../logic/schedule.ts";
import { DECKS, allCardKeys, allCardRefs, dueCardCount, resetSessionForDeck } from "../logic/flashcards.ts";
import type { CardRef } from "../logic/flashcards.ts";
import { drillPairFor } from "../logic/picker.ts";
import { pokemonBySlug } from "../data/pokedex.ts";
import type { Pokemon } from "../data/types.ts";
import { dueAt, formatInterval, scheduleStatus } from "../logic/schedule.ts";
import { jumpToTab, useDetailHash } from "../logic/hashState.ts";
import CategoryPill from "./CategoryPill.tsx";
import Sprite from "./Sprite.tsx";
import PokemonName from "./PokemonName.tsx";
import PokemonDetail from "./PokemonDetail.tsx";
import { useNow } from "./useNow.ts";
import { usePagedList } from "./usePagedList.ts";

const STATUS_LABELS: ReadonlyArray<readonly [ScheduleStatus, string]> = [
  ["due", "Due"],
  ["learning", "Learning"],
  ["mastered", "Mastered"],
  ["new", "New"],
];

// The deck whose pad offers a category (Not Fully Evolved, Mega and Gmax
// have none): the Study next pool, and which coverage squares get a Cards
// button. Only decks that credit their options count; Matchups offers the
// types but teaches the type chart.
const DECK_FOR_CATEGORY = new Map<string, string>(
  DECKS.filter((deck) => !deck.categories).flatMap((deck) =>
    deck.options.map((option) => [option.id, deck.id] as const),
  ),
);
const DECKABLE_CATEGORIES: Category[] = [...DECK_FOR_CATEGORY.keys()].map(getCategory);

// The coverage map's rows, in display order, with their terse labels.
const COVERAGE_GROUPS: ReadonlyArray<readonly [CategoryGroup, string]> = [
  ["region", "Region"],
  ["type", "Type"],
  ["typeCount", "Count"],
  ["stage", "Stage"],
  ["evo", "Evolution"],
  ["special", "Group"],
];

// The Cards button: the deck for the category's group, dealt fresh.
function goCards(deckId: string): void {
  resetSessionForDeck(deckId);
  jumpToTab("cards", deckId === "all" ? [] : [deckId]);
}

interface ReviewRowProps {
  label: string;
  summary: ScheduleSummary;
  // when given, the tiles are buttons and `active` marks the open one
  onSelect?: (status: ScheduleStatus) => void;
  active?: ScheduleStatus | null;
}

function ReviewRow({ label, summary, onSelect, active = null }: ReviewRowProps) {
  // one tile body; the tag (button vs span) is the only difference
  const Tile = onSelect ? "button" : "span";
  return (
    <div className="srs-row">
      <span className="srs-label">{label}</span>
      <div className="srs-tiles">
        {STATUS_LABELS.map(([key, text]) => (
          <Tile
            key={key}
            className={`srs-tile ${key}${active === key ? " active" : ""}`}
            {...(onSelect
              ? { type: "button" as const, "aria-pressed": active === key, onClick: () => onSelect(key) }
              : {})}
          >
            <span className="srs-num">{summary[key]}</span>
            <span className="srs-key">{text}</span>
          </Tile>
        ))}
      </div>
    </div>
  );
}

const LIST_PAGE = 60;

interface CardStatusListProps {
  status: ScheduleStatus;
  merged: MergedStats;
  now: number;
  onOpen: (pokemon: Pokemon) => void;
}

// Every card currently in `status`, most urgent first, batched (more
// load as the end scrolls near, like every other long list here).
function CardStatusList({ status, merged, now, onOpen }: CardStatusListProps) {
  const refs = useMemo(() => {
    const matching = allCardRefs().filter((ref) => scheduleStatus(merged.flashcards[ref.key], now) === status);
    // due: most overdue first; learning/mastered: next up first; new: dex order
    if (status !== "new") {
      matching.sort((a, b) => dueAt(merged.flashcards[a.key]) - dueAt(merged.flashcards[b.key]));
    }
    return matching;
  }, [status, merged, now]);
  const { shown, done, sentinelRef } = usePagedList(refs, LIST_PAGE);

  const timing = (ref: CardRef): string => {
    if (status === "new") return "not seen yet";
    const dueTime = dueAt(merged.flashcards[ref.key]);
    if (dueTime <= now) return `due ${formatInterval(now - dueTime)} ago`;
    return `next in ${formatInterval(dueTime - now)}`;
  };

  return (
    <div className="card-status-list">
      {shown.map((ref) => (
        <button key={ref.key} type="button" className="card-status-row" onClick={() => onOpen(ref.pokemon)}>
          <span className="card-status-thumb">
            <Sprite pokemon={ref.pokemon} />
          </span>
          <span className="card-status-name">
            <PokemonName name={ref.pokemon.displayName} />
          </span>
          <span className="card-status-meta">
            {ref.label} · {timing(ref)}
          </span>
        </button>
      ))}
      {!done ? <div ref={sentinelRef} aria-hidden="true" /> : null}
      {!refs.length ? <p className="hint">Nothing here right now.</p> : null}
    </div>
  );
}

interface ReviewPanelProps {
  merged: MergedStats;
  now: number;
}

function ReviewPanel({ merged, now }: ReviewPanelProps) {
  const flashcardKeys = useMemo(() => allCardKeys(), []);
  const cards = useMemo(() => scheduleSummary(merged.flashcards, flashcardKeys, now), [merged, flashcardKeys, now]);
  const pairKeys = useMemo(() => allValidPairs(QUIZ_CATEGORIES).map(([a, b]) => pairKey(a.id, b.id)), []);
  const pairs = useMemo(() => scheduleSummary(merged.pairs, pairKeys, now), [merged, pairKeys, now]);
  // the tapped tile's status, whose cards list below (tap again to close)
  const [openStatus, setOpenStatus] = useState<ScheduleStatus | null>(null);
  const [detail, openDetail, closeDetail] = useDetailHash(pokemonBySlug);
  return (
    <div className="srs-panel">
      <p className="hint">
        Answered items come back on a growing schedule (10 min → 1 → 3 → 7 → 16
        → 35 → 80 → 180 days) and reset on a miss. Due items are favoured;
        mastered ones fade out. Tap a flashcard number to see its cards.
      </p>
      <ReviewRow
        label="Flashcards"
        summary={cards}
        active={openStatus}
        onSelect={(status) => setOpenStatus((current) => (current === status ? null : status))}
      />
      <ReviewRow label="Drill Pairs" summary={pairs} />
      {openStatus ? <CardStatusList status={openStatus} merged={merged} now={now} onOpen={openDetail} /> : null}
      {detail ? <PokemonDetail pokemon={detail} onClose={closeDetail} onOpen={openDetail} /> : null}
    </div>
  );
}

function timeAgo(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

function Chevron() {
  return (
    <svg
      className="chevron"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="m9 5 7 7-7 7" />
    </svg>
  );
}

function LinkDeviceQR() {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const url = handoffUrl();

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    QRCode.toDataURL(url, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 240,
      color: { dark: "#0c0c0f", light: "#f5f4f6" },
    })
      .then((rendered) => {
        if (!cancelled) setDataUrl(rendered);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!url) return null;
  return (
    <div className="handoff">
      {dataUrl ? (
        <img className="handoff-qr" src={dataUrl} alt="QR code linking this account" />
      ) : error ? (
        <p className="hint">Couldn&apos;t render QR: {error}</p>
      ) : null}
      <p className="hint handoff-note">
        Scan with the other device&apos;s camera to connect it. This code
        contains your token, so don&apos;t share it or screenshot it publicly.
      </p>
    </div>
  );
}

interface DeviceListProps {
  devices: DeviceInfo[];
  absorbDevice: (deviceId: string) => Promise<void>;
  now: number;
}

// Every browser storage that ever synced has its own block: phone Safari,
// the home-screen app, a desktop browser, a private window… Stale ones
// (cleared storage, reinstalled app) can be folded into this device.
function DeviceList({ devices, absorbDevice, now }: DeviceListProps) {
  // the device being merged right now
  const [busy, setBusy] = useState<string | null>(null);
  const others = devices.filter((device) => !device.isThis);
  if (!others.length) return null;
  const sorted = [...devices].sort(
    (a, b) => (b.isThis ? 1 : 0) - (a.isThis ? 1 : 0) || (b.lastActive || 0) - (a.lastActive || 0),
  );
  return (
    <ul className="device-list">
      {sorted.map((device) => (
        <li key={device.deviceId}>
          <span className="device-name">
            {device.name}
            {device.isThis ? <span className="device-this"> · This Device</span> : null}
          </span>
          <span className="device-meta">
            {device.attempts} answer{device.attempts === 1 ? "" : "s"}
            {device.lastActive ? ` · ${timeAgo(device.lastActive, now)}` : ""}
          </span>
          {!device.isThis ? (
            <button
              className="ghost small"
              disabled={busy !== null}
              onClick={async () => {
                if (
                  !window.confirm(
                    `Merge "${device.name}" (${device.attempts} answers) into this device and forget it? ` +
                      "Do this for stale duplicates only: that device would start over on its next sync.",
                  )
                )
                  return;
                setBusy(device.deviceId);
                await absorbDevice(device.deviceId);
                setBusy(null);
              }}
            >
              {busy === device.deviceId ? "Merging…" : "Merge Into This Device"}
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function SyncPanel() {
  const {
    syncState,
    token,
    saveToken,
    account,
    googleAvailable,
    connectGoogle,
    disconnectGoogle,
    syncNow,
    devices: deviceList,
    absorbDevice,
  } = useStats();
  const [draft, setDraft] = useState("");
  const [showQR, setShowQR] = useState(false);
  const [showDevices, setShowDevices] = useState(false);
  // a sign-in or sign-out in flight
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const now = useNow(15_000);
  const devices = `${syncState.deviceCount} device${syncState.deviceCount === 1 ? "" : "s"}`;
  const synced = syncState.lastSyncedAt ? timeAgo(syncState.lastSyncedAt, now) : null;

  // Start fetching the firebase chunk before the button is pressed, so
  // the sign-in popup isn't stuck behind a download (popup blockers
  // only tolerate a short gap after the click).
  useEffect(() => {
    if (googleAvailable && !account) preloadCloud();
  }, [googleAvailable, account]);

  // Straight from the click handler, with no awaits before the popup opens.
  const handleSignIn = () => {
    setAuthError(null);
    setAuthBusy(true);
    connectGoogle()
      .then((result) => {
        // an unreadable gist keeps the token so nothing is lost; the
        // Forget button stays available
        if (!result.hadLegacyToken || result.imported === null) return;
        const importedNote =
          result.imported > 0
            ? `Imported ${result.imported} other device histor${result.imported === 1 ? "y" : "ies"} from your gist. `
            : "";
        if (
          window.confirm(
            `${importedNote}Sync now runs through your Google account. Forget the GitHub token on this device?`,
          )
        ) {
          saveToken("");
        }
      })
      .catch((reason: unknown) => setAuthError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setAuthBusy(false));
  };

  const handleSignOut = () => {
    setAuthBusy(true);
    disconnectGoogle()
      .catch((reason: unknown) => setAuthError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setAuthBusy(false));
  };

  const statusHint = (gistMode: boolean) => (
    <p className="hint">
      <span className={`status-dot ${syncState.status}`} />
      {syncState.status === "ok" && `Synced ${synced}, tracking ${devices}.`}
      {syncState.status === "syncing" && "Syncing…"}
      {syncState.status === "error" &&
        `Sync failed: ${syncState.lastError}.` +
          (gistMode ? " Check the token's Gists permission." : "") +
          (synced ? ` Last good sync ${synced}.` : "")}
      {syncState.status === "idle" && (gistMode ? "Token saved." : "Signed in.")}
    </p>
  );

  const devicesToggle =
    deviceList.length > 1 ? (
      <button className="ghost" aria-expanded={showDevices} onClick={() => setShowDevices((visible) => !visible)}>
        {showDevices ? "Hide Devices" : "Devices"}
      </button>
    ) : null;

  const devicesSection = showDevices ? (
    <>
      <p className="hint">
        Each browser or home-screen app that has synced keeps its own
        history here. A duplicate you no longer use (cleared storage,
        reinstalled app) can be merged into this device.
      </p>
      <DeviceList devices={deviceList} absorbDevice={absorbDevice} now={now} />
    </>
  ) : null;

  const tokenSteps = (
    <ol className="sync-steps">
      <li>
        On GitHub: Settings → Developer settings → Personal access
        tokens → Fine-grained tokens → Generate new token
      </li>
      <li>
        Under Account permissions, set <strong>Gists</strong> to Read
        and write (nothing else), then generate
      </li>
      <li>
        Paste the token here, then use <strong>Link another
        device</strong> to move it to your other devices by QR code
      </li>
    </ol>
  );

  const tokenForm = (
    <div className="sync-actions">
      <input
        type="password"
        placeholder="github_pat_…"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <button
        className="primary"
        disabled={!draft.trim()}
        onClick={() => {
          saveToken(draft.trim());
          setDraft("");
        }}
      >
        Connect
      </button>
    </div>
  );

  return (
    <div className="sync-panel">
      {account ? (
        <>
          {statusHint(false)}
          <div className="sync-actions">
            <button className="ghost" onClick={() => void syncNow()}>
              Sync Now
            </button>
            {devicesToggle}
            <button className="ghost" disabled={authBusy} onClick={handleSignOut}>
              {authBusy ? "Signing Out…" : "Sign Out"}
            </button>
          </div>
          <p className="hint">
            Signed in as {account.email || account.displayName}. Progress is
            kept in your Google account. To add a device, just sign in there.
          </p>
          {token ? (
            <div className="sync-actions">
              <button
                className="ghost small"
                onClick={() => {
                  if (
                    window.confirm(
                      "Forget the old GitHub token stored on this device? The gist itself is untouched.",
                    )
                  )
                    saveToken("");
                }}
              >
                Forget Old GitHub Token
              </button>
            </div>
          ) : null}
          {devicesSection}
        </>
      ) : token ? (
        <>
          {statusHint(true)}
          <div className="sync-actions">
            <button className="ghost" onClick={() => void syncNow()}>
              Sync Now
            </button>
            <button
              className="ghost"
              aria-expanded={showQR}
              onClick={() => setShowQR((visible) => !visible)}
            >
              {showQR ? "Hide QR" : "Link Another Device"}
            </button>
            {devicesToggle}
            <button className="ghost" onClick={() => saveToken("")}>
              Disconnect
            </button>
          </div>
          {showQR ? <LinkDeviceQR /> : null}
          {devicesSection}
          {googleAvailable ? (
            <>
              <p className="hint">
                Google sign-in is replacing the token sync: your gist history
                comes along, and other devices just sign in instead of
                scanning a QR code.
              </p>
              {authError ? <p className="hint">Sign-in failed: {authError}</p> : null}
              <div className="sync-actions">
                <button className="primary" disabled={authBusy} onClick={handleSignIn}>
                  {authBusy ? "Signing In…" : "Sign In with Google & Migrate"}
                </button>
              </div>
            </>
          ) : null}
        </>
      ) : googleAvailable ? (
        <>
          <p className="hint">
            Progress is stored on this device. Sign in with Google to keep
            phone and desktop in sync. Your stats live in your own Google
            account.
          </p>
          {authError ? <p className="hint">Sign-in failed: {authError}</p> : null}
          <div className="sync-actions">
            <button className="primary" disabled={authBusy} onClick={handleSignIn}>
              {authBusy ? "Signing In…" : "Sign In with Google"}
            </button>
          </div>
          <details className="sync-help">
            <summary>
              <Chevron /> Legacy: Connect With a GitHub Token
            </summary>
            {tokenSteps}
            {tokenForm}
          </details>
        </>
      ) : (
        <>
          <p className="hint">
            Progress is stored on this device. To share it between phone and
            desktop, paste a GitHub token. The app keeps your stats in a
            private gist on your account.
          </p>
          <details className="sync-help">
            <summary>
              <Chevron /> How to Create a Token
            </summary>
            {tokenSteps}
          </details>
          {tokenForm}
        </>
      )}
    </div>
  );
}

// With sync on, there's a choice between this device's history and everything.
function ResetPanel() {
  const { resetLocal, resetAll, token, account, devices } = useStats();
  const synced = Boolean(token || account) && devices.length > 1;
  return (
    <div className="reset-actions">
      <button
        className="ghost danger"
        onClick={() => {
          if (window.confirm(synced ? "Reset this device's stats? Other devices keep theirs." : "Reset all stats?"))
            resetLocal();
        }}
      >
        {synced ? "Reset This Device" : "Reset Stats"}
      </button>
      {synced ? (
        <button
          className="ghost danger"
          onClick={() => {
            if (window.confirm("Reset stats on ALL devices? This can't be undone.")) void resetAll();
          }}
        >
          Reset All Devices
        </button>
      ) : null}
    </div>
  );
}

// "Aug 17, 2026, 2:30 PM PT"; __BUILD_TIME__ is always a full ISO stamp
function formatBuildTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    dateStyle: "medium",
    timeStyle: "short",
  }) + " PT";
}

// One row shared by Study next and the coverage selection: pill, accuracy,
// and both practice entry points.
interface CategoryRowProps {
  category: Category;
  entry: StatEntry | undefined;
  onDrill: (catId: string) => void;
}

function CategoryRow({ category, entry, onDrill }: CategoryRowProps) {
  const deckId = DECK_FOR_CATEGORY.get(category.id);
  return (
    <div className="study-row">
      <CategoryPill cat={category} useShort />
      <span className="study-acc">
        {entry?.a ? `${Math.round((entry.c / entry.a) * 100)}% · ${entry.c}/${entry.a}` : "not asked yet"}
      </span>
      <div className="row-actions">
        {deckId ? (
          <button className="mini-primary" onClick={() => goCards(deckId)}>
            Cards
          </button>
        ) : null}
        <button className="mini-ghost" onClick={() => onDrill(category.id)}>
          Drill
        </button>
      </div>
    </div>
  );
}

function StatsView() {
  const { merged, account, token } = useStats();
  // a slow clock: fresh enough that cards falling due while the tab sits
  // open show up, coarse enough that the memos below still do their job
  const now = useNow(60_000);
  const due = useMemo(() => dueCardCount(merged, now), [merged, now]);
  // the tapped coverage square (tap again to close)
  const [covSel, setCovSel] = useState<string | null>(null);
  const [srsOpen, setSrsOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);

  // Answers given: every attempt is a drill pair or a flashcard (the
  // per-category counts in merged.attempts bump once per category asked,
  // so a dual-type card or a drill counts twice there).
  const answered = useMemo(() => {
    let count = 0;
    for (const entry of Object.values(merged.pairs)) count += entry.a;
    for (const entry of Object.values(merged.flashcards)) count += entry.a;
    return count;
  }, [merged]);
  const overallPct = useMemo(() => {
    let correct = 0;
    for (const entry of Object.values(merged.categories)) correct += entry.c;
    return merged.attempts ? Math.round((correct / merged.attempts) * 100) : 0;
  }, [merged]);

  // The three weakest deckable categories with enough attempts to judge.
  const weakest = useMemo(
    () =>
      DECKABLE_CATEGORIES.map((category) => ({ category, entry: merged.categories[category.id] }))
        .filter((row): row is { category: Category; entry: StatEntry } => Boolean(row.entry && row.entry.a >= 3))
        .sort((a, b) => a.entry.c / a.entry.a - b.entry.c / b.entry.a)
        .slice(0, 3),
    [merged],
  );

  // The Drill button: a pair containing the category (an already-practised
  // partner when one exists), straight into the Drill tab.
  const openDrill = (catId: string): void => {
    const [a, b] = drillPairFor(catId, merged);
    jumpToTab("drill", [a.id, b.id]);
  };

  const coverageColor = (entry: StatEntry | undefined): string => {
    if (!entry?.a) return "";
    const accuracy = entry.c / entry.a;
    return accuracy < 0.55 ? " low" : accuracy < 0.75 ? " mid" : " high";
  };
  const coverageTotal = COVERAGE_GROUPS.reduce(
    (count, [group]) => count + QUIZ_CATEGORIES.filter((category) => category.group === group).length,
    0,
  );
  const covCategory = covSel ? getCategory(covSel) : null;

  return (
    <div className="stats">
      <div className="stats-head">
        <h2>Progress</h2>
        <span className="stats-total">
          {answered} answered · {overallPct}% overall
        </span>
      </div>

      <section className="study-next">
        <p className="panel-label accent">Study next</p>
        {weakest.length ? (
          <div className="study-rows">
            {weakest.map(({ category, entry }) => (
              <CategoryRow key={category.id} category={category} entry={entry} onDrill={openDrill} />
            ))}
          </div>
        ) : (
          <p className="hint">Answer a few cards or drills and your weakest categories will show up here.</p>
        )}
        <button className="review-due" onClick={() => goCards("all")}>
          Review {due} due card{due === 1 ? "" : "s"}
        </button>
      </section>

      <section className="coverage">
        <div className="coverage-head">
          <p className="panel-label">Coverage · {coverageTotal} categories</p>
          <span className="coverage-legend" aria-hidden="true">
            weak
            <i className="legend-swatch low" />
            <i className="legend-swatch mid" />
            <i className="legend-swatch high" />
            strong
          </span>
        </div>
        <div className="coverage-rows">
          {COVERAGE_GROUPS.map(([group, label]) => (
            <div key={group} className="coverage-row">
              <span className="coverage-group">{label}</span>
              <div className="coverage-grid">
                {QUIZ_CATEGORIES.filter((category) => category.group === group).map((category) => (
                  <button
                    key={category.id}
                    className={`cov-cell${coverageColor(merged.categories[category.id])}${covSel === category.id ? " selected" : ""}`}
                    title={category.label}
                    aria-label={category.label}
                    aria-pressed={covSel === category.id}
                    onClick={() => setCovSel((current) => (current === category.id ? null : category.id))}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
        {covCategory ? (
          <div className="cov-sel">
            <CategoryRow category={covCategory} entry={merged.categories[covCategory.id]} onDrill={openDrill} />
          </div>
        ) : null}
        <p className="cov-hint">Tap any square for its category: accuracy and a way into practice.</p>
      </section>

      <div className="accordion">
        <button className="accordion-row" aria-expanded={srsOpen} onClick={() => setSrsOpen((open) => !open)}>
          Spaced review schedule
          <span className="accordion-meta">{due} due ›</span>
        </button>
        {srsOpen ? (
          <div className="accordion-body">
            <ReviewPanel merged={merged} now={now} />
          </div>
        ) : null}
        <button className="accordion-row" aria-expanded={syncOpen} onClick={() => setSyncOpen((open) => !open)}>
          Cross-device sync
          <span className="accordion-meta">{account || token ? "on" : "off"} ›</span>
        </button>
        {syncOpen ? (
          <div className="accordion-body">
            <SyncPanel />
            <ResetPanel />
          </div>
        ) : null}
      </div>

      <p className="hint meta">Site built {formatBuildTime(__BUILD_TIME__)}</p>
    </div>
  );
}

export default StatsView;
