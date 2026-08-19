import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { StatsContext } from "./StatsContext.ts";
import type { DeviceInfo, StatsContextValue, SyncState } from "./StatsContext.ts";
import { readHash, writeHash } from "./logic/hashState.ts";
import TabNav from "./components/TabNav.tsx";
import { PokeballIcon } from "./components/Sprite.tsx";
import Browser from "./components/Browser.tsx";
import Drill from "./components/Drill.tsx";
import Flashcards from "./components/Flashcards.tsx";
import PracticeGrid from "./components/PracticeGrid.tsx";
import StatsView from "./components/StatsView.tsx";
import {
  absorbBlock,
  describeDevice,
  emptyBlock,
  loadBlock,
  mergeBlocks,
  saveBlock,
  summarizeBlock,
  withAttempt,
} from "./logic/stats.ts";
import type { AttemptEvent, MergedStats, StatsBlock } from "./logic/stats.ts";
import {
  consumeHandoffFromUrl,
  getToken,
  removeDeviceBlock,
  resetRemoteBlocks,
  setToken,
  syncBlock,
} from "./logic/sync.ts";

const TABS = ["Browse", "Drill", "Cards", "Grid", "Stats"] as const;
type Tab = (typeof TABS)[number];
const DEFAULT_TAB: Tab = "Browse";

// The active tab is the first hash segment (#cards/region — see
// logic/hashState.ts) so a refresh, a shared link, or back/forward lands
// on the same tab; each tab keeps its own state after the slash.
function tabFromHash(): Tab | null {
  const slug = readHash().tab;
  return TABS.find((tab) => tab.toLowerCase() === slug) || null;
}
const SYNC_DEBOUNCE_MS = 10_000;
// Re-pull other devices' progress while the tab is open: on becoming
// visible again (if the last sync is older than MIN_REPULL_MS) and on a
// timer while visible.
const REPULL_INTERVAL_MS = 5 * 60_000;
const MIN_REPULL_MS = 60_000;

const IDLE_SYNC: SyncState = { status: "idle", deviceCount: 1, lastSyncedAt: null };

const errorMessage = (reason: unknown): string => (reason instanceof Error ? reason.message : String(reason));

function App() {
  const [tab, setTab] = useState<Tab>(() => tabFromHash() || DEFAULT_TAB);
  const [block, setBlock] = useState<StatsBlock>(() => {
    const loaded = loadBlock();
    if (loaded.deviceName) return loaded;
    // Name the device so the sync panel can tell blocks apart
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
    const named = { ...loaded, deviceName: describeDevice(navigator.userAgent, standalone) };
    saveBlock(named);
    return named;
  });
  const [remoteBlocks, setRemoteBlocks] = useState<StatsBlock[]>([]);
  // A QR handoff link (#connect=…) stores its token before anything else.
  const [token, setTokenState] = useState(() => consumeHandoffFromUrl() || getToken());
  const [syncState, setSyncState] = useState<SyncState>(IDLE_SYNC);

  const blockRef = useRef(block);
  blockRef.current = block;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The latest cross-device merge; new attempts continue streaks from it
  // (see stats.withAttempt) so last-writer-wins sync stays correct.
  const mergedRef = useRef<MergedStats | null>(null);

  const lastSyncRef = useRef(0);
  const inFlightRef = useRef(false);
  const rerunRef = useRef(false);

  const syncNow = useCallback(async (): Promise<void> => {
    if (!getToken()) return;
    if (inFlightRef.current) {
      rerunRef.current = true; // pick up whatever changed once this one lands
      return;
    }
    inFlightRef.current = true;
    setSyncState((state) => ({ ...state, status: "syncing" }));
    try {
      const blocks = await syncBlock(blockRef.current);
      setRemoteBlocks(blocks.filter((other) => other.deviceId !== blockRef.current.deviceId));
      lastSyncRef.current = Date.now();
      setSyncState({ status: "ok", deviceCount: blocks.length, lastSyncedAt: lastSyncRef.current });
    } catch (reason) {
      setSyncState((state) => ({
        status: "error",
        lastError: errorMessage(reason),
        deviceCount: 1,
        lastSyncedAt: state.lastSyncedAt,
      }));
    } finally {
      inFlightRef.current = false;
      if (rerunRef.current) {
        rerunRef.current = false;
        void syncNow();
      }
    }
  }, []);

  const scheduleSync = useCallback(() => {
    if (!getToken()) return;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void syncNow(), SYNC_DEBOUNCE_MS);
  }, [syncNow]);

  useEffect(() => {
    void syncNow();
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [syncNow]);

  useEffect(() => {
    const repull = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastSyncRef.current < MIN_REPULL_MS) return;
      void syncNow();
    };
    document.addEventListener("visibilitychange", repull);
    const interval = setInterval(repull, REPULL_INTERVAL_MS);
    return () => {
      document.removeEventListener("visibilitychange", repull);
      clearInterval(interval);
    };
  }, [syncNow]);

  const recordAttempt = useCallback(
    (event: AttemptEvent) => {
      setBlock((previous) => {
        const next = withAttempt(previous, event, { merged: mergedRef.current });
        saveBlock(next);
        return next;
      });
      scheduleSync();
    },
    [scheduleSync],
  );

  const saveToken = useCallback(
    (value: string) => {
      setToken(value);
      setTokenState(value);
      setRemoteBlocks([]);
      lastSyncRef.current = 0;
      setSyncState(IDLE_SYNC);
      if (value) void syncNow();
    },
    [syncNow],
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
  const resetAll = useCallback(async (): Promise<void> => {
    const fresh = { ...emptyBlock(blockRef.current.deviceId), deviceName: blockRef.current.deviceName };
    saveBlock(fresh);
    setBlock(fresh);
    blockRef.current = fresh;
    if (!getToken()) return;
    setSyncState((state) => ({ ...state, status: "syncing" }));
    try {
      const blocks = await resetRemoteBlocks(fresh);
      setRemoteBlocks([]);
      lastSyncRef.current = Date.now();
      setSyncState({ status: "ok", deviceCount: blocks.length, lastSyncedAt: lastSyncRef.current });
    } catch (reason) {
      setSyncState((state) => ({ ...state, status: "error", lastError: errorMessage(reason) }));
    }
  }, []);

  // Fold another device's history into this one and drop its block from
  // the gist (for stale duplicates: reinstalled apps, cleared storage,
  // private windows).
  const absorbDevice = useCallback(
    async (deviceId: string): Promise<void> => {
      const other = remoteBlocks.find((remote) => remote.deviceId === deviceId);
      if (!other) return;
      const next = absorbBlock(blockRef.current, other);
      saveBlock(next);
      setBlock(next);
      blockRef.current = next;
      setSyncState((state) => ({ ...state, status: "syncing" }));
      try {
        const blocks = await removeDeviceBlock(deviceId, next);
        setRemoteBlocks(blocks.filter((remote) => remote.deviceId !== next.deviceId));
        lastSyncRef.current = Date.now();
        setSyncState({ status: "ok", deviceCount: blocks.length, lastSyncedAt: lastSyncRef.current });
      } catch (reason) {
        setSyncState((state) => ({ ...state, status: "error", lastError: errorMessage(reason) }));
      }
    },
    [remoteBlocks],
  );

  const devices = useMemo(
    (): DeviceInfo[] =>
      [block, ...remoteBlocks].map((entry) => ({
        deviceId: entry.deviceId,
        name: entry.deviceName || "Unnamed device",
        isThis: entry.deviceId === block.deviceId,
        ...summarizeBlock(entry),
      })),
    [block, remoteBlocks],
  );

  const merged = useMemo(
    () => mergeBlocks([...remoteBlocks, block]),
    [remoteBlocks, block],
  );
  mergedRef.current = merged;

  const stats = useMemo(
    (): StatsContextValue => ({
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
    [block, merged, recordAttempt, syncState, token, saveToken, syncNow, resetLocal, resetAll, devices, absorbDevice],
  );

  const selectTab = useCallback((next: Tab) => {
    setTab(next);
    if (tabFromHash() !== next) writeHash(next, [], { push: true, detail: null });
    window.scrollTo(0, 0);
  }, []);

  // The title is a home link: the Browse tab with no filters and no sheet.
  // Browser only reads the hash on mount, so remount it to drop its filters.
  const [homeKey, setHomeKey] = useState(0);
  const goHome = useCallback((event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    writeHash(DEFAULT_TAB, [], { push: true, detail: null });
    setTab(DEFAULT_TAB);
    setHomeKey((key) => key + 1);
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
