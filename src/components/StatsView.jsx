import { useState } from "react";
import { useStats } from "../StatsContext.js";
import { CATEGORIES, CATEGORY_GROUPS } from "../data/categories.js";
import { smoothedAccuracy } from "../logic/stats.js";
import { DATA_META } from "../data/pokedex.js";

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

function SyncPanel() {
  const { syncState, token, saveToken, syncNow } = useStats();
  const [draft, setDraft] = useState("");

  return (
    <section className="sync-panel">
      <h3>Cross-device sync</h3>
      {token ? (
        <>
          <p className="hint">
            <span className={`status-dot ${syncState.status}`} />
            {syncState.status === "ok" &&
              `Synced — tracking ${syncState.deviceCount} device${syncState.deviceCount === 1 ? "" : "s"}.`}
            {syncState.status === "syncing" && "Syncing…"}
            {syncState.status === "error" &&
              `Sync failed: ${syncState.lastError}. Check the token's Gists permission.`}
            {syncState.status === "idle" && "Token saved."}
          </p>
          <div className="sync-actions">
            <button className="ghost" onClick={syncNow}>
              Sync now
            </button>
            <button className="ghost" onClick={() => saveToken("")}>
              Disconnect
            </button>
          </div>
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
              <Chevron /> How to create a token
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
              <li>Paste the token here, on each device you use</li>
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

function StatsView() {
  const { merged, resetLocal } = useStats();

  return (
    <div className="stats">
      <SyncPanel />

      {CATEGORY_GROUPS.map(([group, label]) => {
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
                        {c.label}
                        {weak ? <span className="weak-chip">Weak</span> : null}
                      </td>
                      <td>{entry ? entry.a : 0}</td>
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
        <button
          className="ghost danger"
          onClick={() => {
            if (window.confirm("Reset this device's stats?")) resetLocal();
          }}
        >
          Reset this device&apos;s stats
        </button>
        <p className="hint meta">
          Data: {DATA_META.source} v{DATA_META.sourceVersion} ·{" "}
          {DATA_META.count} Pokémon · generated {DATA_META.generatedAt}
        </p>
      </section>
    </div>
  );
}

export default StatsView;
