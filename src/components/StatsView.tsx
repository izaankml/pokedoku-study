import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { useStats } from "../StatsContext.ts";
import type { DeviceInfo } from "../StatsContext.ts";
import { handoffUrl } from "../logic/sync.ts";
import { preloadCloud } from "../logic/cloudSync.ts";
import { QUIZ_CATEGORIES, QUIZ_CATEGORY_GROUPS } from "../data/categories.ts";
import { smoothedAccuracy } from "../logic/stats.ts";
import type { MergedStats, StatEntry } from "../logic/stats.ts";
import { allValidPairs, pairKey } from "../logic/matching.ts";
import { scheduleSummary } from "../logic/schedule.ts";
import type { ScheduleStatus, ScheduleSummary } from "../logic/schedule.ts";
import { allCardRefs } from "../logic/flashcards.ts";
import type { CardRef } from "../logic/flashcards.ts";
import { pokemonBySlug } from "../data/pokedex.ts";
import type { Pokemon } from "../data/types.ts";
import { dueAt, formatInterval, scheduleStatus } from "../logic/schedule.ts";
import { useDetailHash } from "../logic/hashState.ts";
import Sprite from "./Sprite.tsx";
import PokemonName from "./PokemonName.tsx";
import PokemonDetail from "./PokemonDetail.tsx";
import { usePagedList } from "./usePagedList.ts";

// Built on first use, not at app start: enumerating every deck's pool is
// real work and only the Stats tab needs the full list.
let cardRefsCache: CardRef[] | null = null;
const cardRefs = (): CardRef[] => (cardRefsCache ??= allCardRefs());

const STATUS_LABELS: ReadonlyArray<readonly [ScheduleStatus, string]> = [
  ["due", "Due"],
  ["learning", "Learning"],
  ["mastered", "Mastered"],
  ["new", "New"],
];

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
    const matching = cardRefs().filter((ref) => scheduleStatus(merged.flashcards[ref.key], now) === status);
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
            {ref.deck.label} · {timing(ref)}
          </span>
        </button>
      ))}
      {!done ? <div ref={sentinelRef} aria-hidden="true" /> : null}
      {!refs.length ? <p className="hint">Nothing here right now.</p> : null}
    </div>
  );
}

function ReviewPanel({ merged }: { merged: MergedStats }) {
  // a slow clock: fresh enough that cards falling due while the tab sits
  // open show up, coarse enough that the memos below still do their job
  // (a per-render Date.now() would defeat all of them)
  const now = useNow(60_000);
  const flashcardKeys = useMemo(() => cardRefs().map((ref) => ref.key), []);
  const cards = useMemo(() => scheduleSummary(merged.flashcards, flashcardKeys, now), [merged, flashcardKeys, now]);
  const pairKeys = useMemo(() => allValidPairs(QUIZ_CATEGORIES).map(([a, b]) => pairKey(a.id, b.id)), []);
  const pairs = useMemo(() => scheduleSummary(merged.pairs, pairKeys, now), [merged, pairKeys, now]);
  // the tapped tile's status — its cards list below (tap again to close)
  const [openStatus, setOpenStatus] = useState<ScheduleStatus | null>(null);
  const [detail, openDetail, closeDetail] = useDetailHash(pokemonBySlug);
  return (
    <section className="srs-panel">
      <h3>Spaced Review</h3>
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
    </section>
  );
}

function AccuracyBar({ entry }: { entry: StatEntry | undefined }) {
  if (!entry || !entry.a) {
    return (
      <div className="acc">
        <span className="acc-num dim">—</span>
      </div>
    );
  }
  const pct = Math.round((entry.c / entry.a) * 100);
  // A row with no correct answers shows a sliver of red (CSS min-width
  // keeps the bar visible), not an empty track
  return (
    <div className="acc">
      <span className="acc-track">
        <span className={entry.c === 0 ? "acc-fill all-miss" : "acc-fill"} style={{ width: `${pct}%` }} />
      </span>
      <span className="acc-num">{pct}%</span>
    </div>
  );
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

// Re-render every `ms` so relative times stay fresh.
function useNow(ms: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
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
        contains your token — don&apos;t share it or screenshot it publicly.
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
                      "Do this for stale duplicates only — that device would start over on its next sync.",
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

  // Straight from the click handler — no awaits before the popup opens.
  const handleSignIn = () => {
    setAuthError(null);
    setAuthBusy(true);
    connectGoogle()
      .then((result) => {
        // Migration ran (or the gist was unreadable: keep the token so
        // nothing is lost — the Forget button stays available).
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
      {syncState.status === "ok" && `Synced ${synced} — tracking ${devices}.`}
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
        Paste the token here — then use <strong>Link another
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
    <section className="sync-panel">
      <h3>Cross-Device Sync</h3>
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
            kept in your Google account — to add a device, just sign in there.
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
            phone and desktop in sync — your stats live in your own Google
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
            desktop, paste a GitHub token — the app keeps your stats in a
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
    </section>
  );
}

// Reset lives up top, next to the review numbers it clears. With sync on,
// there's a choice between this device's history and everything.
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

// "Aug 17, 2026, 2:30 PM PT" — __BUILD_TIME__ is always a full ISO stamp
function formatBuildTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    dateStyle: "medium",
    timeStyle: "short",
  }) + " PT";
}

function StatsView() {
  const { merged } = useStats();

  return (
    <div className="stats">
      <ReviewPanel merged={merged} />
      <ResetPanel />
      <SyncPanel />

      {/* Type count has no deck and the type table says it all (the two
          categories still count for Drill/Grid weighting); the Browse-only
          groups are never quizzed, so QUIZ_CATEGORY_GROUPS already skips
          them */}
      {QUIZ_CATEGORY_GROUPS.filter(([group]) => group !== "typeCount").map(([group, label]) => {
        const cats = QUIZ_CATEGORIES.filter((category) => category.group === group);
        return (
          <section key={group}>
            <h3>{label}</h3>
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Answered</th>
                  <th>Accuracy</th>
                </tr>
              </thead>
              <tbody>
                {cats.map((category) => {
                  const entry = merged.categories[category.id];
                  const weak = Boolean(entry && entry.a >= 3 && smoothedAccuracy(entry) < 0.55);
                  return (
                    <tr key={category.id} className={weak ? "weak" : ""}>
                      <td>
                        {/* the section heading already says Region / Type */}
                        {group === "region" || group === "type" ? category.short : category.label}
                        {weak ? <span className="weak-chip">Weak</span> : null}
                      </td>
                      <td className={entry?.a ? undefined : "zero"}>{entry ? entry.a : 0}</td>
                      <td>
                        <AccuracyBar entry={entry} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}

      <section>
        <p className="hint meta">Site built {formatBuildTime(__BUILD_TIME__)}</p>
      </section>
    </div>
  );
}

export default StatsView;
