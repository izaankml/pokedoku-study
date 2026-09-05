import { createContext, useContext } from "react";
import type { CloudAccount } from "./logic/cloudSync.ts";
import type { AttemptEvent, BlockSummary, MergedStats, StatsBlock } from "./logic/stats.ts";

export type SyncStatus = "idle" | "syncing" | "ok" | "error";

export interface SyncState {
  status: SyncStatus;
  // how many devices' blocks the last sync saw (ours included)
  deviceCount: number;
  lastSyncedAt: number | null;
  lastError?: string;
}

// What connectGoogle reports back for the migration offer: whether a gist
// token was present, and how many other devices' histories were imported
// from the gist (null when the gist couldn't be read, so the token is kept).
export interface ConnectResult {
  hadLegacyToken: boolean;
  imported: number | null;
}

// A device whose block is in the sync, for the Stats tab's device list.
export interface DeviceInfo extends BlockSummary {
  deviceId: string;
  name: string;
  isThis: boolean;
}

export interface StatsContextValue {
  // this device's own history
  block: StatsBlock;
  // the cross-device merge, for display and weighting
  merged: MergedStats;
  // records the attempt and returns a token for undoLastAttempt
  recordAttempt: (event: AttemptEvent) => number;
  // reverts the attempt `token` came from, if it is still the newest
  // recorded one; true when it was undone
  undoLastAttempt: (token: number) => boolean;
  // the token of the attempt that can currently be undone, if any
  undoableAttempt: number | null;
  syncState: SyncState;
  // legacy gist sync: the PAT (empty when none)
  token: string;
  saveToken: (token: string) => void;
  // Google sync: the signed-in account (null when signed out)
  account: CloudAccount | null;
  // whether this build has a Firebase config at all
  googleAvailable: boolean;
  // signs in with the popup, migrates gist history if a PAT is present;
  // must be called straight from a click handler (popup blockers)
  connectGoogle: () => Promise<ConnectResult>;
  disconnectGoogle: () => Promise<void>;
  syncNow: () => Promise<void>;
  resetLocal: () => void;
  resetAll: () => Promise<void>;
  devices: DeviceInfo[];
  absorbDevice: (deviceId: string) => Promise<void>;
}

export const StatsContext = createContext<StatsContextValue | null>(null);

export function useStats(): StatsContextValue {
  const stats = useContext(StatsContext);
  if (!stats) throw new Error("useStats must be used within <StatsContext.Provider>");
  return stats;
}
