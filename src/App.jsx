import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StatsContext } from "./StatsContext.js";
import { readHash, writeHash } from "./logic/hashState.js";
import TabNav from "./components/TabNav.jsx";
import { PokeballIcon } from "./components/Sprite.jsx";
import Browser from "./components/Browser.jsx";
import Drill from "./components/Drill.jsx";
import Flashcards from "./components/Flashcards.jsx";
import PracticeGrid from "./components/PracticeGrid.jsx";
import StatsView from "./components/StatsView.jsx";
import {
  absorbBlock,
  describeDevice,
  emptyBlock,
  loadBlock,
  mergeBlocks,
  saveBlock,
  summarizeBlock,
  withAttempt,
} from "./logic/stats.js";
import {
  consumeHandoffFromUrl,
  getToken,
  removeDeviceBlock,
  resetRemoteBlocks,
  setToken,
  syncBlock,
} from "./logic/sync.js";

const TABS = ["Browse", "Drill", "Cards", "Grid", "Stats"];
const DEFAULT_TAB = "Browse";

// The active tab is the first hash segment (#cards/region — see
// logic/hashState.js) so a refresh, a shared link, or back/forward lands
// on the same tab; each tab keeps its own state after the slash.
function tabFromHash() {
  const slug = readHash().tab;
  return TABS.find((t) => t.toLowerCase() === slug) || null;
}
const SYNC_DEBOUNCE_MS = 10_000;
// Re-pull other devices' progress while the tab is open: on becoming
// visible again (if the last sync is older than MIN_REPULL_MS) and on a
// timer while visible.
const REPULL_INTERVAL_MS = 5 * 60_000;
const MIN_REPULL_MS = 60_000;

function App() {
  const [tab, setTab] = useState(() => tabFromHash() || DEFAULT_TAB);
  const [block, setBlock] = useState(() => {
    const loaded = loadBlock();
    if (loaded.deviceName) return loaded;
    // Name the device so the sync panel can tell blocks apart
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches;
    const named = { ...loaded, deviceName: describeDevice(navigator.userAgent, standalone) };
    saveBlock(named);
    return named;
  });
  const [remoteBlocks, setRemoteBlocks] = useState([]);
  // A QR handoff link (#connect=…) stores its token before anything else.
  const [token, setTokenState] = useState(() => consumeHandoffFromUrl() || getToken());
  const [syncState, setSyncState] = useState({
    status: "idle",
    deviceCount: 1,
    lastSyncedAt: null,
  });

  const blockRef = useRef(block);
  blockRef.current = block;
  const timerRef = useRef(null);
  // The latest cross-device merge; new attempts continue streaks from it
  // (see stats.withAttempt) so last-writer-wins sync stays correct.
  const mergedRef = useRef(null);

  const lastSyncRef = useRef(0);
  const inFlightRef = useRef(false);
  const rerunRef = useRef(false);

  const syncNow = useCallback(async () => {
    if (!getToken()) return;
    if (inFlightRef.current) {
      rerunRef.current = true; // pick up whatever changed once this one lands
      return;
    }
    inFlightRef.current = true;
    setSyncState((s) => ({ ...s, status: "syncing" }));
    try {
      const blocks = await syncBlock(blockRef.current);
      setRemoteBlocks(blocks.filter((b) => b.deviceId !== blockRef.current.deviceId));
      lastSyncRef.current = Date.now();
      setSyncState({ status: "ok", deviceCount: blocks.length, lastSyncedAt: lastSyncRef.current });
    } catch (err) {
      setSyncState((s) => ({
        status: "error",
        lastError: err.message,
        deviceCount: 1,
        lastSyncedAt: s.lastSyncedAt,
      }));
    } finally {
      inFlightRef.current = false;
      if (rerunRef.current) {
        rerunRef.current = false;
        syncNow();
      }
    }
  }, []);

  const scheduleSync = useCallback(() => {
    if (!getToken()) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(syncNow, SYNC_DEBOUNCE_MS);
  }, [syncNow]);

  useEffect(() => {
    syncNow();
    return () => clearTimeout(timerRef.current);
  }, [syncNow]);

  useEffect(() => {
    const repull = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastSyncRef.current < MIN_REPULL_MS) return;
      syncNow();
    };
    document.addEventListener("visibilitychange", repull);
    const interval = setInterval(repull, REPULL_INTERVAL_MS);
    return () => {
      document.removeEventListener("visibilitychange", repull);
      clearInterval(interval);
    };
  }, [syncNow]);

  const recordAttempt = useCallback(
    (evt) => {
      setBlock((prev) => {
        const next = withAttempt(prev, evt, { merged: mergedRef.current });
        saveBlock(next);
        return next;
      });
      scheduleSync();
    },
    [scheduleSync]
  );

  const saveToken = useCallback(
    (value) => {
      setToken(value);
      setTokenState(value);
      setRemoteBlocks([]);
      lastSyncRef.current = 0;
      setSyncState({ status: "idle", deviceCount: 1, lastSyncedAt: null });
      if (value) syncNow();
    },
    [syncNow]
  );

  // Keeps this device's id and name so the reset doesn't leave a stale
  // block behind in the gist.
  const resetLocal = useCallback(() => {
    const fresh = { ...emptyBlock(blockRef.current.deviceId), deviceName: blockRef.current.deviceName };
    saveBlock(fresh);
    setBlock(fresh);
    scheduleSync();
  }, [scheduleSync]);

  // Wipe everything: this device and every synced device's block.
  const resetAll = useCallback(async () => {
    const fresh = { ...emptyBlock(blockRef.current.deviceId), deviceName: blockRef.current.deviceName };
    saveBlock(fresh);
    setBlock(fresh);
    blockRef.current = fresh;
    if (!getToken()) return;
    setSyncState((s) => ({ ...s, status: "syncing" }));
    try {
      const blocks = await resetRemoteBlocks(fresh);
      setRemoteBlocks([]);
      lastSyncRef.current = Date.now();
      setSyncState({ status: "ok", deviceCount: blocks.length, lastSyncedAt: lastSyncRef.current });
    } catch (err) {
      setSyncState((s) => ({ ...s, status: "error", lastError: err.message }));
    }
  }, []);

  // Fold another device's history into this one and drop its block from
  // the gist (for stale duplicates: reinstalled apps, cleared storage,
  // private windows).
  const absorbDevice = useCallback(
    async (deviceId) => {
      const other = remoteBlocks.find((b) => b.deviceId === deviceId);
      if (!other) return;
      const next = absorbBlock(blockRef.current, other);
      saveBlock(next);
      setBlock(next);
      blockRef.current = next;
      setSyncState((s) => ({ ...s, status: "syncing" }));
      try {
        const blocks = await removeDeviceBlock(deviceId, next);
        setRemoteBlocks(blocks.filter((b) => b.deviceId !== next.deviceId));
        lastSyncRef.current = Date.now();
        setSyncState({ status: "ok", deviceCount: blocks.length, lastSyncedAt: lastSyncRef.current });
      } catch (err) {
        setSyncState((s) => ({ ...s, status: "error", lastError: err.message }));
      }
    },
    [remoteBlocks]
  );

  const devices = useMemo(
    () =>
      [block, ...remoteBlocks].map((b) => ({
        deviceId: b.deviceId,
        name: b.deviceName || "Unnamed device",
        isThis: b.deviceId === block.deviceId,
        ...summarizeBlock(b),
      })),
    [block, remoteBlocks]
  );

  const merged = useMemo(
    () => mergeBlocks([...remoteBlocks, block]),
    [remoteBlocks, block]
  );
  mergedRef.current = merged;

  const stats = useMemo(
    () => ({
      block,
      merged,
      recordAttempt,
      syncState,
      token,
      saveToken,
      syncNow,
      resetLocal,
      resetAll,
      devices,
      absorbDevice,
    }),
    [block, merged, recordAttempt, syncState, token, saveToken, syncNow, resetLocal, resetAll, devices, absorbDevice]
  );

  const selectTab = useCallback((t) => {
    setTab(t);
    if (tabFromHash() !== t) writeHash(t, [], { push: true, detail: null });
    // #root is the scroll container (see App.css)
    document.getElementById("root")?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  }, []);

  // The title is a home link: the Browse tab with no filters and no sheet.
  // Browser only reads the hash on mount, so remount it to drop its filters.
  const [homeKey, setHomeKey] = useState(0);
  const goHome = useCallback((e) => {
    e.preventDefault();
    writeHash(DEFAULT_TAB, [], { push: true, detail: null });
    setTab(DEFAULT_TAB);
    setHomeKey((k) => k + 1);
    document.getElementById("root")?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  }, []);

  // Back/forward (and hand-edited hashes) drive the tab too.
  useEffect(() => {
    const onHash = () => setTab(tabFromHash() || DEFAULT_TAB);
    window.addEventListener("popstate", onHash);
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener("popstate", onHash);
      window.removeEventListener("hashchange", onHash);
    };
  }, []);

  return (
    <div className="app">
      <header>
        <h1>
          <a className="home-link" href={"#" + DEFAULT_TAB.toLowerCase()} onClick={goHome} aria-label="PokeDoku Study — home">
            <PokeballIcon className="pokeball-mark" width="22" height="22" />
            <span>PokeDoku</span> <span className="h1-sub">Study</span>
          </a>
        </h1>
        <TabNav tabs={TABS} active={tab} onSelect={selectTab} />
      </header>
      <StatsContext.Provider value={stats}>
        <main>
          {tab === "Browse" && <Browser key={homeKey} />}
          {tab === "Drill" && <Drill />}
          {tab === "Cards" && <Flashcards />}
          {tab === "Grid" && <PracticeGrid />}
          {tab === "Stats" && <StatsView />}
        </main>
      </StatsContext.Provider>
    </div>
  );
}

export default App;
