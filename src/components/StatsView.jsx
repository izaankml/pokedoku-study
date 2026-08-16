import { useState } from "react";
import { useStats } from "../StatsContext.js";
import { CATEGORIES, CATEGORY_GROUPS } from "../data/categories.js";
import { smoothedAccuracy } from "../logic/stats.js";
import { DATA_META } from "../data/pokedex.js";

function accuracyLabel(entry) {
  if (!entry || !entry.a) return "—";
  return `${Math.round((entry.c / entry.a) * 100)}%`;
}

function StatsView() {
  const { merged, syncState, token, saveToken, syncNow, resetLocal } = useStats();
  const [draft, setDraft] = useState("");

  return (
    <div className="stats">
      <section className="sync-panel">
        <h3>Cross-device sync</h3>
        {token ? (
          <>
            <p className="hint">
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
            <ol className="hint sync-steps">
              <li>
                On GitHub: Settings → Developer settings → Personal access
                tokens → Fine-grained tokens → Generate new token
              </li>
              <li>
                Under Account permissions, set <strong>Gists</strong> to
                Read and write (nothing else), then generate
              </li>
              <li>Paste the token here, on each device you use</li>
            </ol>
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
                  const weak = entry && entry.a >= 3 && smoothedAccuracy(entry) < 0.55;
                  return (
                    <tr key={c.id} className={weak ? "weak" : ""}>
                      <td>{c.label}</td>
                      <td>{entry ? entry.a : 0}</td>
                      <td>{accuracyLabel(entry)}</td>
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
