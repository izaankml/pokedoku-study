import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useStats } from "../StatsContext.js";
import { handoffUrl } from "../logic/sync.js";
import { CATEGORIES, CATEGORY_GROUPS } from "../data/categories.js";
import { smoothedAccuracy } from "../logic/stats.js";
import { allValidPairs, pairKey } from "../logic/matching.js";
import { scheduleSummary } from "../logic/schedule.js";
import { DATA_META } from "../data/pokedex.js";
import { allCardKeys } from "../logic/flashcards.js";

const FLASHCARD_KEYS = allCardKeys();

const STATUS_LABELS = [
  ["due", "Due"],
  ["learning", "Learning"],
  ["mastered", "Mastered"],
  ["new", "New"],
];

function ReviewRow({ label, summary }) {
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

function ReviewPanel({ merged }) {
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

function AccuracyBar({ entry, weakRow }) {
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
function useNow(ms) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function timeAgo(ts, now) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

function LinkDeviceQR() {
  const [dataUrl, setDataUrl] = useState(null);
  const [error, setError] = useState(null);
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
      .then((d) => !cancelled && setDataUrl(d))
      .catch((e) => !cancelled && setError(e.message));
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

// Every browser storage that ever synced has its own block: phone Safari,
// the home-screen app, a desktop browser, a private window… Stale ones
// (cleared storage, reinstalled app) can be folded into this device.
function DeviceList({ devices, absorbDevice, now }) {
  const [busy, setBusy] = useState(null);
  const others = devices.filter((d) => !d.isThis);
  if (!others.length) return null;
  const sorted = [...devices].sort((a, b) => (b.isThis ? 1 : 0) - (a.isThis ? 1 : 0) || (b.lastActive || 0) - (a.lastActive || 0));
  return (
    <ul className="device-list">
      {sorted.map((d) => (
        <li key={d.deviceId}>
          <span className="device-name">
            {d.name}
            {d.isThis ? <span className="device-this"> · This Device</span> : null}
          </span>
          <span className="device-meta">
            {d.attempts} answer{d.attempts === 1 ? "" : "s"}
            {d.lastActive ? ` · ${timeAgo(d.lastActive, now)}` : ""}
          </span>
          {!d.isThis ? (
            <button
              className="ghost small"
              disabled={busy !== null}
              onClick={async () => {
                if (
                  !window.confirm(
                    `Merge "${d.name}" (${d.attempts} answers) into this device and forget it? ` +
                      "Do this for stale duplicates only — that device would start over on its next sync."
                  )
                )
                  return;
                setBusy(d.deviceId);
                await absorbDevice(d.deviceId);
                setBusy(null);
              }}
            >
              {busy === d.deviceId ? "Merging…" : "Merge Into This Device"}
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
            <button className="ghost" onClick={syncNow}>
              Sync Now
            </button>
            <button
              className="ghost"
              aria-expanded={showQR}
              onClick={() => setShowQR((v) => !v)}
            >
              {showQR ? "Hide QR" : "Link Another Device"}
            </button>
            {deviceList.length > 1 ? (
              <button
                className="ghost"
                aria-expanded={showDevices}
                onClick={() => setShowDevices((v) => !v)}
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
              onChange={(e) => setDraft(e.target.value)}
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
            if (window.confirm("Reset stats on ALL devices? This can't be undone.")) resetAll();
          }}
        >
          Reset All Devices
        </button>
      ) : null}
    </div>
  );
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
        const cats = CATEGORIES.filter((c) => c.group === group);
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
                {cats.map((c) => {
                  const entry = merged.categories[c.id];
                  const weak =
                    entry && entry.a >= 3 && smoothedAccuracy(entry) < 0.55;
                  return (
                    <tr key={c.id} className={weak ? "weak" : ""}>
                      <td>
                        {/* the section heading already says Region / Type */}
                        {group === "region" || group === "type" ? c.short : c.label}
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
          {DATA_META.count} Pokémon · generated {DATA_META.generatedAt}
        </p>
      </section>
    </div>
  );
}

export default StatsView;
