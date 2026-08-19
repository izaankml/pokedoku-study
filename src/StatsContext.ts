import { createContext, useContext } from "react";
import type { AttemptEvent, BlockSummary, MergedStats, StatsBlock } from "./logic/stats.ts";

export type SyncStatus = "idle" | "syncing" | "ok" | "error";

export interface SyncState {
  status: SyncStatus;
  // how many devices' blocks the last sync saw (ours included)
  deviceCount: number;
  lastSyncedAt: number | null;
  lastError?: string;
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
  recordAttempt: (event: AttemptEvent) => void;
  syncState: SyncState;
  token: string;
  saveToken: (token: string) => void;
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
