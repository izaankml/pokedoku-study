import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StatsContext } from "./StatsContext.js";
import TabNav from "./components/TabNav.jsx";
import { PokeballIcon } from "./components/Sprite.jsx";
import Browser from "./components/Browser.jsx";
import Drill from "./components/Drill.jsx";
import Flashcards from "./components/Flashcards.jsx";
import PracticeGrid from "./components/PracticeGrid.jsx";
import StatsView from "./components/StatsView.jsx";
import { emptyBlock, loadBlock, mergeBlocks, saveBlock, withAttempt } from "./logic/stats.js";
import { getToken, setToken, syncBlock } from "./logic/sync.js";

const TABS = ["Browse", "Drill", "Cards", "Grid", "Stats"];
const SYNC_DEBOUNCE_MS = 10_000;

function App() {
  const [tab, setTab] = useState("Drill");
  const [block, setBlock] = useState(loadBlock);
  const [remoteBlocks, setRemoteBlocks] = useState([]);
  const [token, setTokenState] = useState(getToken);
  const [syncState, setSyncState] = useState({ status: "idle", deviceCount: 1 });

  const blockRef = useRef(block);
  blockRef.current = block;
  const timerRef = useRef(null);
  // The latest cross-device merge; new attempts continue streaks from it
  // (see stats.withAttempt) so last-writer-wins sync stays correct.
  const mergedRef = useRef(null);

  const syncNow = useCallback(async () => {
    if (!getToken()) return;
    setSyncState((s) => ({ ...s, status: "syncing" }));
    try {
      const blocks = await syncBlock(blockRef.current);
      setRemoteBlocks(blocks.filter((b) => b.deviceId !== blockRef.current.deviceId));
      setSyncState({ status: "ok", deviceCount: blocks.length });
    } catch (err) {
      setSyncState({ status: "error", lastError: err.message, deviceCount: 1 });
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
      setSyncState({ status: "idle", deviceCount: 1 });
      if (value) syncNow();
    },
    [syncNow]
  );

  const resetLocal = useCallback(() => {
    const fresh = emptyBlock();
    saveBlock(fresh);
    setBlock(fresh);
    scheduleSync();
  }, [scheduleSync]);

  const merged = useMemo(
    () => mergeBlocks([...remoteBlocks, block]),
    [remoteBlocks, block]
  );
  mergedRef.current = merged;

  const stats = useMemo(
    () => ({ block, merged, recordAttempt, syncState, token, saveToken, syncNow, resetLocal }),
    [block, merged, recordAttempt, syncState, token, saveToken, syncNow, resetLocal]
  );

  const selectTab = useCallback((t) => {
    setTab(t);
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="app">
      <header>
        <h1>
          <PokeballIcon className="pokeball-mark" width="22" height="22" />
          <span>PokeDoku</span> <span className="h1-sub">Study</span>
        </h1>
        <TabNav tabs={TABS} active={tab} onSelect={selectTab} />
      </header>
      <StatsContext.Provider value={stats}>
        <main>
          {tab === "Browse" && <Browser />}
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
