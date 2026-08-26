import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  _setBackendForTests,
  hasCloudSession,
  importLegacyBlocks,
  removeDeviceBlock,
  resetRemoteBlocks,
  signIn,
  signOutGoogle,
  syncBlock,
} from "./cloudSync.ts";
import type { BlockDoc, CloudAccount, CloudBackend } from "./cloudSync.ts";
import { emptyBlock } from "./stats.ts";
import type { StatsBlock } from "./stats.ts";

// Minimal localStorage for the node test environment (the session flag).
type TestGlobals = { localStorage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> };
const testGlobals = globalThis as unknown as TestGlobals;

function installLocalStorage(): void {
  const store = new Map<string, string>();
  testGlobals.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, String(value));
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
}

// In-memory stand-in for the Firestore-backed CloudBackend.
class FakeBackend implements CloudBackend {
  docs = new Map<string, string>();
  writes = 0;
  batches: Array<{ deletes: string[]; write: string | null }> = [];
  user: CloudAccount = { uid: "uid-1", email: "kamal@example.test", displayName: "Kamal" };

  async signIn(): Promise<CloudAccount> {
    return this.user;
  }
  async signOut(): Promise<void> {}
  async restoreUser(): Promise<CloudAccount | null> {
    return this.user;
  }
  async listBlocks(): Promise<BlockDoc[]> {
    return [...this.docs].map(([deviceId, json]) => ({ deviceId, json }));
  }
  async writeBlock(_uid: string, deviceId: string, json: string): Promise<void> {
    this.writes++;
    this.docs.set(deviceId, json);
  }
  async applyBatch(_uid: string, deleteIds: string[], write: BlockDoc | null): Promise<void> {
    this.batches.push({ deletes: deleteIds, write: write?.deviceId ?? null });
    for (const deviceId of deleteIds) this.docs.delete(deviceId);
    if (write) this.docs.set(write.deviceId, write.json);
  }
}

function block(deviceId: string, attempts = 1): StatsBlock {
  return { ...emptyBlock(deviceId), categories: { "type:fire": { a: attempts, c: attempts } } };
}

let backend: FakeBackend;

beforeEach(async () => {
  installLocalStorage();
  backend = new FakeBackend();
  _setBackendForTests(backend);
  await signIn();
});
afterEach(() => {
  _setBackendForTests(null);
  delete testGlobals.localStorage;
});

describe("session", () => {
  it("signIn marks the device's session; signOut clears it", async () => {
    expect(hasCloudSession()).toBe(true);
    await signOutGoogle();
    expect(hasCloudSession()).toBe(false);
  });

  it("ops throw when not signed in", async () => {
    _setBackendForTests(backend); // resets the account
    await expect(syncBlock(block("dev-a"))).rejects.toThrow("Not signed in");
  });
});

describe("syncBlock", () => {
  it("creates our doc on first sync and returns all blocks", async () => {
    const own = block("dev-a");
    backend.docs.set("dev-b", JSON.stringify(block("dev-b", 5)));
    const blocks = await syncBlock(own);
    expect(backend.docs.has("dev-a")).toBe(true);
    expect(blocks.map((entry) => entry.deviceId).sort()).toEqual(["dev-a", "dev-b"]);
  });

  it("skips the write when the remote copy is identical", async () => {
    const own = block("dev-a");
    await syncBlock(own);
    expect(backend.writes).toBe(1);
    await syncBlock(own);
    expect(backend.writes).toBe(1); // re-pull didn't churn
    await syncBlock(block("dev-a", 2));
    expect(backend.writes).toBe(2);
  });

  it("skips a corrupt doc and keeps going", async () => {
    backend.docs.set("dev-bad", "{not json");
    backend.docs.set("dev-b", JSON.stringify(block("dev-b")));
    const blocks = await syncBlock(block("dev-a"));
    expect(blocks.map((entry) => entry.deviceId).sort()).toEqual(["dev-a", "dev-b"]);
  });
});

describe("resetRemoteBlocks", () => {
  it("deletes every other device and writes our fresh block in one batch", async () => {
    backend.docs.set("dev-b", JSON.stringify(block("dev-b")));
    backend.docs.set("dev-c", JSON.stringify(block("dev-c")));
    const fresh = emptyBlock("dev-a");
    const blocks = await resetRemoteBlocks(fresh);
    expect(blocks).toEqual([fresh]);
    expect(backend.batches).toEqual([{ deletes: ["dev-b", "dev-c"], write: "dev-a" }]);
    expect([...backend.docs.keys()]).toEqual(["dev-a"]);
  });
});

describe("removeDeviceBlock", () => {
  it("drops the absorbed device and returns the remaining blocks", async () => {
    backend.docs.set("dev-b", JSON.stringify(block("dev-b")));
    backend.docs.set("dev-c", JSON.stringify(block("dev-c")));
    const own = block("dev-a", 9);
    const blocks = await removeDeviceBlock("dev-b", own);
    expect(blocks.map((entry) => entry.deviceId).sort()).toEqual(["dev-a", "dev-c"]);
    expect(backend.docs.has("dev-b")).toBe(false);
    expect(JSON.parse(backend.docs.get("dev-a") ?? "")).toEqual(own);
  });
});

describe("importLegacyBlocks", () => {
  it("imports only blocks Firestore hasn't seen, never our own", async () => {
    backend.docs.set("dev-b", JSON.stringify(block("dev-b", 100))); // already migrated: must not be overwritten
    const gistBlocks = [block("dev-a", 3), block("dev-b", 1), block("dev-c", 7)];
    const imported = await importLegacyBlocks(gistBlocks, "dev-a");
    expect(imported).toBe(1);
    expect(backend.docs.has("dev-a")).toBe(false); // own block syncs normally afterwards
    expect((JSON.parse(backend.docs.get("dev-b") ?? "") as StatsBlock).categories["type:fire"].a).toBe(100);
    expect(backend.docs.has("dev-c")).toBe(true);
  });
});
