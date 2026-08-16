import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consumeHandoffFromUrl, getToken, handoffUrl, setToken, syncBlock } from "./sync.js";
import { emptyBlock } from "./stats.js";

// Minimal browser globals for the node test environment.
function installBrowser(href) {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const location = new URL(href);
  globalThis.window = {
    location,
    history: {
      replaceState: vi.fn((_s, _t, url) => {
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
  delete globalThis.localStorage;
  delete globalThis.window;
  vi.restoreAllMocks();
  delete globalThis.fetch;
});

describe("handoff", () => {
  it("builds a fragment link carrying token and gist id, and consumes it", () => {
    setToken("github_pat_abc");
    localStorage.setItem("pokedoku-study:gist-id", "g123");
    const url = handoffUrl();
    expect(url).toBe("https://example.test/pokedoku-study/#connect=github_pat_abc&gist=g123");

    // Fresh device opens the link.
    installBrowser(url);
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
  function fakeGist(devices) {
    return {
      id: "g1",
      files: { "pokedoku-study-progress.json": { content: JSON.stringify({ devices }) } },
    };
  }

  function mockFetch(remoteDevices) {
    const calls = [];
    globalThis.fetch = vi.fn(async (url, init = {}) => {
      calls.push({ url, method: init.method || "GET", body: init.body && JSON.parse(init.body) });
      return { ok: true, json: async () => fakeGist(remoteDevices) };
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
    const written = JSON.parse(
      calls[1].body.files["pokedoku-study-progress.json"].content
    ).devices;
    expect(written.me).toEqual(own);
    expect(written.other).toEqual(other); // untouched
  });
});
