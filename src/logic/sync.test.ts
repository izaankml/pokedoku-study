import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consumeHandoffFromUrl, getToken, handoffUrl, setToken, syncBlock } from "./sync.ts";
import { emptyBlock } from "./stats.ts";
import type { StatsBlock } from "./stats.ts";

// Minimal browser globals for the node test environment: just the parts of
// localStorage, window.location and window.history that sync.ts touches.
type TestGlobals = {
  localStorage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  window?: { location: URL; history: { replaceState: (state: unknown, title: string, url: string) => void } };
  fetch?: typeof fetch;
};
const testGlobals = globalThis as unknown as TestGlobals;

function installBrowser(href: string): void {
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
  const location = new URL(href);
  testGlobals.window = {
    location,
    history: {
      replaceState: vi.fn((_state: unknown, _title: string, url: string) => {
        const next = new URL(url, location.href);
        location.pathname = next.pathname;
        location.search = next.search;
        location.hash = "";
      }),
    },
  };
}

beforeEach(() => installBrowser("https://example.test/pokedoku-study/"));
afterEach(() => {
  delete testGlobals.localStorage;
  delete testGlobals.window;
  vi.restoreAllMocks();
  delete testGlobals.fetch;
});

describe("handoff", () => {
  it("builds a fragment link carrying token and gist id, and consumes it", () => {
    setToken("github_pat_abc");
    localStorage.setItem("pokedoku-study:gist-id", "g123");
    const url = handoffUrl();
    expect(url).toBe("https://example.test/pokedoku-study/#connect=github_pat_abc&gist=g123");

    // Fresh device opens the link.
    installBrowser(url ?? "");
    expect(getToken()).toBe("");
    expect(consumeHandoffFromUrl()).toBe("github_pat_abc");
    expect(getToken()).toBe("github_pat_abc");
    expect(localStorage.getItem("pokedoku-study:gist-id")).toBe("g123");
    // URL is scrubbed.
    expect(window.history.replaceState).toHaveBeenCalledWith(null, "", "/pokedoku-study/");
    expect(window.location.hash).toBe("");
  });

  it("ignores unrelated or empty fragments", () => {
    installBrowser("https://example.test/pokedoku-study/#tab=Stats");
    expect(consumeHandoffFromUrl()).toBeNull();
    expect(getToken()).toBe("");
    expect(window.history.replaceState).not.toHaveBeenCalled();
    installBrowser("https://example.test/pokedoku-study/");
    expect(consumeHandoffFromUrl()).toBeNull();
  });

  it("returns null when there is no token", () => {
    expect(handoffUrl()).toBeNull();
  });
});

describe("syncBlock", () => {
  type DeviceBlocks = Record<string, StatsBlock>;

  function fakeGist(devices: DeviceBlocks) {
    return {
      id: "g1",
      files: { "pokedoku-study-progress.json": { content: JSON.stringify({ devices }) } },
    };
  }

  // A request as sync.ts made it; `body` is the parsed JSON of a write.
  interface FetchCall {
    url: string;
    method: string;
    body: { files: Record<string, { content: string }> } | undefined;
  }

  function mockFetch(remoteDevices: DeviceBlocks): FetchCall[] {
    const calls: FetchCall[] = [];
    testGlobals.fetch = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
      const body = typeof init.body === "string" ? (JSON.parse(init.body) as FetchCall["body"]) : undefined;
      calls.push({ url: String(url), method: init.method || "GET", body });
      return { ok: true, json: async () => fakeGist(remoteDevices) } as unknown as Response;
    });
    return calls;
  }

  it("skips the PATCH when the remote copy of our block is identical", async () => {
    setToken("t");
    localStorage.setItem("pokedoku-study:gist-id", "g1");
    const own = emptyBlock("me");
    const other = emptyBlock("other");
    const calls = mockFetch({ me: own, other });
    const blocks = await syncBlock(own);
    expect(calls.map((c) => c.method)).toEqual(["GET"]);
    expect(blocks.map((b) => b.deviceId).sort()).toEqual(["me", "other"]);
  });

  it("PATCHes only our slot when our block changed", async () => {
    setToken("t");
    localStorage.setItem("pokedoku-study:gist-id", "g1");
    const stale = emptyBlock("me");
    const other = emptyBlock("other");
    other.categories.mono = { a: 2, c: 1 };
    const own = { ...stale, categories: { mono: { a: 1, c: 1 } } };
    const calls = mockFetch({ me: stale, other });
    await syncBlock(own);
    expect(calls.map((c) => c.method)).toEqual(["GET", "PATCH"]);
    const content = calls[1].body?.files["pokedoku-study-progress.json"].content ?? "{}";
    const written = (JSON.parse(content) as { devices: DeviceBlocks }).devices;
    expect(written.me).toEqual(own);
    expect(written.other).toEqual(other); // untouched
  });
});
