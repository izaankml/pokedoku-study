import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useStats } from "../StatsContext.ts";
import type { DeviceInfo } from "../StatsContext.ts";
import { handoffUrl } from "../logic/sync.ts";
import { CATEGORIES, CATEGORY_GROUPS } from "../data/categories.ts";
import { smoothedAccuracy } from "../logic/stats.ts";
import type { MergedStats, StatEntry } from "../logic/stats.ts";
import { allValidPairs, pairKey } from "../logic/matching.ts";
import { scheduleSummary } from "../logic/schedule.ts";
import type { ScheduleStatus, ScheduleSummary } from "../logic/schedule.ts";
import { DATA_META, POKEMON } from "../data/pokedex.ts";
import { allCardKeys } from "../logic/flashcards.ts";

const FLASHCARD_KEYS = allCardKeys();

const STATUS_LABELS: ReadonlyArray<readonly [ScheduleStatus, string]> = [
  ["due", "Due"],
  ["learning", "Learning"],
  ["mastered", "Mastered"],
  ["new", "New"],
];

function ReviewRow({ label, summary }: { label: string; summary: ScheduleSummary }) {
  return (
    <div className="srs-row">
      <span className="srs-label">{label}</span>
      <div className="srs-tiles">
        {STATUS_LABELS.map(([key, text]) => (
          <span key={key} className={`srs-tile ${key}`}>
            <span className="srs-num">{summary[key]}</span>
            <span className="srs-key">{text}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function ReviewPanel({ merged }: { merged: MergedStats }) {
  const now = Date.now();
  const cards = scheduleSummary(merged.flashcards, FLASHCARD_KEYS, now);
  const pairKeys = allValidPairs(CATEGORIES).map(([a, b]) => pairKey(a.id, b.id));
  const pairs = scheduleSummary(merged.pairs, pairKeys, now);
  return (
    <section className="srs-panel">
      <h3>Spaced Review</h3>
      <p className="hint">
        Answered items come back on a growing schedule (10 min → 1 → 3 → 7 → 16
        → 35 → 80 → 180 days) and reset on a miss. Due items are favoured;
        mastered ones fade out.
      </p>
      <ReviewRow label="Flashcards" summary={cards} />
      <ReviewRow label="Drill Pairs" summary={pairs} />
    </section>
  );
}

function AccuracyBar({ entry, weakRow }: { entry: StatEntry | undefined; weakRow: boolean }) {
  if (!entry || !entry.a) {
    return (
      <div className="acc">
        <span className="acc-num dim">—</span>
      </div>
    );
  }
  const pct = Math.round((entry.c / entry.a) * 100);
  return (
    <div className="acc">
      <span className="acc-track">
        <span
          className="acc-fill"
          style={{ width: `${pct}%` }}
          data-weak={weakRow || undefined}
        />
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
  const { syncState, token, saveToken, syncNow, devices: deviceList, absorbDevice } = useStats();
  const [draft, setDraft] = useState("");
  const [showQR, setShowQR] = useState(false);
  const [showDevices, setShowDevices] = useState(false);
  const now = useNow(15_000);
  const devices = `${syncState.deviceCount} device${syncState.deviceCount === 1 ? "" : "s"}`;
  const synced = syncState.lastSyncedAt ? timeAgo(syncState.lastSyncedAt, now) : null;

  return (
    <section className="sync-panel">
      <h3>Cross-Device Sync</h3>
      {token ? (
        <>
          <p className="hint">
            <span className={`status-dot ${syncState.status}`} />
            {syncState.status === "ok" && `Synced ${synced} — tracking ${devices}.`}
            {syncState.status === "syncing" && "Syncing…"}
            {syncState.status === "error" &&
              `Sync failed: ${syncState.lastError}. Check the token's Gists permission.` +
                (synced ? ` Last good sync ${synced}.` : "")}
            {syncState.status === "idle" && "Token saved."}
          </p>
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
            {deviceList.length > 1 ? (
              <button
                className="ghost"
                aria-expanded={showDevices}
                onClick={() => setShowDevices((visible) => !visible)}
              >
                {showDevices ? "Hide Devices" : "Devices"}
              </button>
            ) : null}
            <button className="ghost" onClick={() => saveToken("")}>
              Disconnect
            </button>
          </div>
          {showQR ? <LinkDeviceQR /> : null}
          {showDevices ? (
            <>
              <p className="hint">
                Each browser or home-screen app that has synced keeps its own
                history here. A duplicate you no longer use (cleared storage,
                reinstalled app) can be merged into this device.
              </p>
              <DeviceList devices={deviceList} absorbDevice={absorbDevice} now={now} />
            </>
          ) : null}
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
          </details>
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
        </>
      )}
    </section>
  );
}

// Reset lives up top, next to the review numbers it clears. With sync on,
// there's a choice between this device's history and everything.
function ResetPanel() {
  const { resetLocal, resetAll, token, devices } = useStats();
  const synced = Boolean(token) && devices.length > 1;
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

// "Aug 17, 2026, 2:30 PM PT"; older datasets only carried a date
function formatGenerated(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  if (!iso.includes("T")) return iso;
  return date.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    dateStyle: "medium",
    timeStyle: "short",
  }) + " PT";
}

// TEMP: viewport diagnostics for the iOS home-screen layout issue
function ViewportProbe() {
  const [text, setText] = useState("");
  useEffect(() => {
    const px = (value: string): number => {
      const probe = document.createElement("div");
      probe.style.cssText = `position:fixed;top:0;left:0;visibility:hidden;height:${value}`;
      document.body.appendChild(probe);
      const height = probe.getBoundingClientRect().height;
      probe.remove();
      return Math.round(height);
    };
    const update = () => {
      const rootRect = document.getElementById("root")?.getBoundingClientRect();
      const nav = document.querySelector(".tabs")?.getBoundingClientRect();
      const modes = ["standalone", "fullscreen", "minimal-ui", "browser"].filter(
        (mode) => matchMedia(`(display-mode: ${mode})`).matches,
      );
      // Safari's own flag for a home-screen app, outside the Navigator type
      const standalone = (navigator as Navigator & { standalone?: boolean }).standalone;
      setText(
        [
          `inner ${window.innerWidth}×${window.innerHeight}`,
          `screen ${screen.width}×${screen.height}`,
          `vv ${Math.round(visualViewport?.height ?? 0)}`,
          `dvh ${px("100dvh")} lvh ${px("100lvh")} svh ${px("100svh")} vh ${px("100vh")}`,
          `sat ${px("env(safe-area-inset-top)")} sab ${px("env(safe-area-inset-bottom)")}`,
          rootRect ? `root ${Math.round(rootRect.top)}→${Math.round(rootRect.bottom)}` : "no root",
          nav ? `nav ${Math.round(nav.top)}→${Math.round(nav.bottom)}` : "no nav",
          `mode ${modes.join(",") || "?"}`,
          `nav.standalone ${String(standalone)}`,
        ].join(" · "),
      );
    };
    update();
    const timer = setTimeout(update, 500);
    window.addEventListener("resize", update);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", update);
    };
  }, []);
  return <p className="hint meta" style={{ fontFamily: "monospace", fontSize: "0.7rem" }}>{text}</p>;
}

function StatsView() {
  const { merged } = useStats();

  return (
    <div className="stats">
      <ReviewPanel merged={merged} />
      <ResetPanel />
      <SyncPanel />

      {/* Type count has no deck and the type table says it all; the two
          categories still count for Drill/Grid weighting behind the scenes */}
      {CATEGORY_GROUPS.filter(([group]) => group !== "typeCount").map(([group, label]) => {
        const cats = CATEGORIES.filter((category) => category.group === group);
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
                        <AccuracyBar entry={entry} weakRow={weak} />
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
        <p className="hint meta">
          Data: {DATA_META.source} v{DATA_META.sourceVersion} ·{" "}
          {POKEMON.length} answers · generated {formatGenerated(DATA_META.generatedAt)}
        </p>
        <p className="hint meta">Site built {formatGenerated(__BUILD_TIME__)}</p>
        <ViewportProbe />
      </section>
    </div>
  );
}

export default StatsView;
