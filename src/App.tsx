import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { StatsContext } from "./StatsContext.ts";
import type { ConnectResult, DeviceInfo, StatsContextValue, SyncState } from "./StatsContext.ts";
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
import * as gistSync from "./logic/sync.ts";
import * as cloudSync from "./logic/cloudSync.ts";
import type { CloudAccount } from "./logic/cloudSync.ts";
import { isFirebaseConfigured } from "./logic/firebaseConfig.ts";

// The operations a sync provider must offer; the gist (legacy PAT) and
// Google/Firestore modules both satisfy it structurally, so App's
// debounce/re-pull/undo machinery stays provider-agnostic.
interface SyncOps {
  syncBlock: (ownBlock: StatsBlock) => Promise<StatsBlock[]>;
  resetRemoteBlocks: (ownBlock: StatsBlock) => Promise<StatsBlock[]>;
  removeDeviceBlock: (deviceId: string, ownBlock: StatsBlock) => Promise<StatsBlock[]>;
}
const gistOps: SyncOps = gistSync;
const cloudOps: SyncOps = cloudSync;

const TABS = ["Browse", "Grid", "Cards", "Drill", "Stats"] as const;
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
  const [token, setTokenState] = useState(() => gistSync.consumeHandoffFromUrl() || gistSync.getToken());
  const [syncState, setSyncState] = useState<SyncState>(IDLE_SYNC);

  // The Google account, once signed in / restored. The ref mirrors the
  // state so callbacks with empty deps (syncNow) see it immediately —
  // including in the window between sign-in and the re-render.
  const [account, setAccountState] = useState<CloudAccount | null>(null);
  const accountRef = useRef<CloudAccount | null>(null);
  const applyAccount = useCallback((next: CloudAccount | null) => {
    accountRef.current = next;
    setAccountState(next);
  }, []);
  // True while a stored Google session is being restored at startup —
  // sync holds off (rather than falling back to a leftover gist token)
  // until the account is known.
  const restoringRef = useRef(cloudSync.hasCloudSession());

  // Which sync backend to talk to right now (null: don't sync).
  const chooseOps = useCallback((): SyncOps | null => {
    if (accountRef.current) return cloudOps;
    if (restoringRef.current) return null;
    return gistSync.getToken() ? gistOps : null;
  }, []);

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
    const ops = chooseOps();
    if (!ops) return;
    if (inFlightRef.current) {
      rerunRef.current = true; // pick up whatever changed once this one lands
      return;
    }
    inFlightRef.current = true;
    setSyncState((state) => ({ ...state, status: "syncing" }));
    try {
      const blocks = await ops.syncBlock(blockRef.current);
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
  }, [chooseOps]);

  const scheduleSync = useCallback(() => {
    if (!chooseOps()) return;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void syncNow(), SYNC_DEBOUNCE_MS);
  }, [chooseOps, syncNow]);

  useEffect(() => {
    if (restoringRef.current) {
      // A previous session chose Google sync — restore it (loading the
      // firebase chunk) before the first sync decides on a provider.
      let cancelled = false;
      void cloudSync.restoreAccount().then((restored) => {
        restoringRef.current = false;
        if (cancelled) return;
        applyAccount(restored);
        void syncNow(); // Google when restored, else a leftover gist token
      });
      return () => {
        cancelled = true;
        if (timerRef.current !== null) clearTimeout(timerRef.current);
      };
    }
    void syncNow();
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [applyAccount, syncNow]);

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

  // One-deep undo: each attempt remembers the block as it stood before
  // and after (withAttempt returns a fresh clone, so both objects stay
  // intact) and a token; only the newest attempt can be taken back, and
  // only while the current block IS that attempt's result — so any path
  // that replaces the block (reset, merge, a future import) invalidates
  // the undo structurally, clearUndo or not. Memory-only — a reload
  // forgets it, which is fine for an oops-misclick affordance.
  const undoRef = useRef<{ token: number; before: StatsBlock; after: StatsBlock } | null>(null);
  const attemptCounterRef = useRef(0);
  // mirrors undoRef's token as state, so an Undo button can render away
  // the moment a newer attempt supersedes it
  const [undoableAttempt, setUndoableAttempt] = useState<number | null>(null);

  const clearUndo = useCallback(() => {
    undoRef.current = null;
    setUndoableAttempt(null);
  }, []);

  const recordAttempt = useCallback(
    (event: AttemptEvent): number => {
      const token = ++attemptCounterRef.current;
      setBlock((previous) => {
        const next = withAttempt(previous, event, { merged: mergedRef.current });
        undoRef.current = { token, before: previous, after: next };
        saveBlock(next);
        return next;
      });
      setUndoableAttempt(token);
      scheduleSync();
      return token;
    },
    [scheduleSync],
  );

  const undoLastAttempt = useCallback(
    (token: number): boolean => {
      const undo = undoRef.current;
      if (!undo || undo.token !== token || blockRef.current !== undo.after) return false;
      clearUndo();
      saveBlock(undo.before);
      setBlock(undo.before);
      blockRef.current = undo.before; // a sync firing before the re-render must not upload the undone attempt
      scheduleSync(); // the synced block is device-owned, so re-writing it is safe
      return true;
    },
    [clearUndo, scheduleSync],
  );

  const saveToken = useCallback(
    (value: string) => {
      gistSync.setToken(value);
      setTokenState(value);
      // While Google drives the sync, the PAT is just legacy cleanup —
      // storing/forgetting it must not disturb the live sync state.
      if (accountRef.current) return;
      setRemoteBlocks([]);
      lastSyncRef.current = 0;
      setSyncState(IDLE_SYNC);
      if (value) void syncNow();
    },
    [syncNow],
  );

  // Google sign-in, called straight from the button's click handler so
  // the popup keeps its user-gesture credit. With a PAT present this is
  // also the migration moment: pull what the gist knows and copy blocks
  // Firestore hasn't seen (never overwriting — Firestore is fresher once
  // a device has migrated).
  const connectGoogle = useCallback(async (): Promise<ConnectResult> => {
    const signedIn = await cloudSync.signIn();
    const hadLegacyToken = Boolean(gistSync.getToken());
    let imported: number | null = null;
    if (hadLegacyToken) {
      try {
        const gistBlocks = await gistSync.syncBlock(blockRef.current);
        imported = await cloudSync.importLegacyBlocks(gistBlocks, blockRef.current.deviceId);
      } catch {
        imported = null; // gist unreachable — keep the token, offer nothing
      }
    }
    applyAccount(signedIn);
    setRemoteBlocks([]);
    lastSyncRef.current = 0;
    setSyncState(IDLE_SYNC);
    void syncNow();
    return { hadLegacyToken, imported };
  }, [applyAccount, syncNow]);

  const disconnectGoogle = useCallback(async (): Promise<void> => {
    await cloudSync.signOutGoogle();
    applyAccount(null);
    setRemoteBlocks([]);
    lastSyncRef.current = 0;
    setSyncState(IDLE_SYNC);
    // A kept legacy token resumes gist sync (rare, but coherent).
    if (gistSync.getToken()) void syncNow();
  }, [applyAccount, syncNow]);

  // Keeps this device's id and name so the reset doesn't leave a stale
  // block behind in the gist.
  const resetLocal = useCallback(() => {
    const fresh = { ...emptyBlock(blockRef.current.deviceId), deviceName: blockRef.current.deviceName };
    clearUndo(); // undoing across a reset would resurrect it
    saveBlock(fresh);
    setBlock(fresh);
    scheduleSync();
  }, [clearUndo, scheduleSync]);

  // Wipe everything: this device and every synced device's block.
  const resetAll = useCallback(async (): Promise<void> => {
    const fresh = { ...emptyBlock(blockRef.current.deviceId), deviceName: blockRef.current.deviceName };
    clearUndo();
    saveBlock(fresh);
    setBlock(fresh);
    blockRef.current = fresh;
    const ops = chooseOps();
    if (!ops) return;
    setSyncState((state) => ({ ...state, status: "syncing" }));
    try {
      const blocks = await ops.resetRemoteBlocks(fresh);
      setRemoteBlocks([]);
      lastSyncRef.current = Date.now();
      setSyncState({ status: "ok", deviceCount: blocks.length, lastSyncedAt: lastSyncRef.current });
    } catch (reason) {
      setSyncState((state) => ({ ...state, status: "error", lastError: errorMessage(reason) }));
    }
  }, [chooseOps, clearUndo]);

  // Fold another device's history into this one and drop its block from
  // the gist (for stale duplicates: reinstalled apps, cleared storage,
  // private windows).
  const absorbDevice = useCallback(
    async (deviceId: string): Promise<void> => {
      const ops = chooseOps();
      if (!ops) return;
      const other = remoteBlocks.find((remote) => remote.deviceId === deviceId);
      if (!other) return;
      const next = absorbBlock(blockRef.current, other);
      clearUndo(); // undoing across a merge would drop the absorbed counts
      saveBlock(next);
      setBlock(next);
      blockRef.current = next;
      setSyncState((state) => ({ ...state, status: "syncing" }));
      try {
        const blocks = await ops.removeDeviceBlock(deviceId, next);
        setRemoteBlocks(blocks.filter((remote) => remote.deviceId !== next.deviceId));
        lastSyncRef.current = Date.now();
        setSyncState({ status: "ok", deviceCount: blocks.length, lastSyncedAt: lastSyncRef.current });
      } catch (reason) {
        setSyncState((state) => ({ ...state, status: "error", lastError: errorMessage(reason) }));
      }
    },
    [chooseOps, clearUndo, remoteBlocks],
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
      undoLastAttempt,
      undoableAttempt,
      syncState,
      token,
      saveToken,
      account,
      googleAvailable: isFirebaseConfigured,
      connectGoogle,
      disconnectGoogle,
      syncNow,
      resetLocal,
      resetAll,
      devices,
      absorbDevice,
    }),
    [block, merged, recordAttempt, undoLastAttempt, undoableAttempt, syncState, token, saveToken, account, connectGoogle, disconnectGoogle, syncNow, resetLocal, resetAll, devices, absorbDevice],
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

  // Every route to another tab starts it at the top — including a pill's
  // jumpToBrowse, whose unmounting modal shell restores the OLD tab's
  // scroll offset during the same commit (this effect runs after it)
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);

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
