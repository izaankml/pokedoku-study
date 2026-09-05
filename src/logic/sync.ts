// Cross-device progress sharing through a private GitHub Gist.
//
// The gist holds one JSON file with one stat block per device; every
// device only rewrites its own block, so concurrent devices can never
// clobber each other, and merging is pure addition (stats.mergeBlocks).
//
// Requires a fine-grained personal access token with only the "Gists"
// read/write permission. It is kept in localStorage on each device.

import type { StatsBlock } from "./stats.ts";

const TOKEN_KEY = "pokedoku-study:gist-token";
const GIST_ID_KEY = "pokedoku-study:gist-id";
const GIST_FILENAME = "pokedoku-study-progress.json";
const GIST_DESCRIPTION = "PokeDoku Study progress (managed by the app)";
const API = "https://api.github.com";

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setToken(token: string): void {
  if (token) localStorage.setItem(TOKEN_KEY, token.trim());
  else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(GIST_ID_KEY);
  }
}

// ---- device handoff via URL fragment ----
//
// "Link another device" renders a QR code of the app URL with the token
// (and gist id, if known) in the hash. The fragment never reaches any
// server; on load the receiving device stores it and scrubs the URL.

const HANDOFF_PARAM = "connect";
const HANDOFF_GIST_PARAM = "gist";

export function handoffUrl(): string | null {
  const token = getToken();
  if (!token) return null;
  const params = new URLSearchParams({ [HANDOFF_PARAM]: token });
  const gistId = localStorage.getItem(GIST_ID_KEY);
  if (gistId) params.set(HANDOFF_GIST_PARAM, gistId);
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = params.toString();
  return url.toString();
}

// Call once on startup. Returns the token if the URL carried one.
export function consumeHandoffFromUrl(): string | null {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const token = params.get(HANDOFF_PARAM);
  if (!token) return null;
  setToken(token);
  const gistId = params.get(HANDOFF_GIST_PARAM);
  if (gistId) localStorage.setItem(GIST_ID_KEY, gistId);
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  return token.trim();
}

// The parts of GitHub's gist responses the app reads.
interface GistFile {
  content?: string;
}
interface Gist {
  id: string;
  files?: Record<string, GistFile | undefined>;
}

// The gist's one file: a block per device, keyed by device id.
type DeviceBlocks = Record<string, StatsBlock>;
interface GistContent {
  devices: DeviceBlocks;
}

interface ApiOptions {
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
}

async function api<T>(path: string, { method = "GET", body }: ApiOptions = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new Error(`GitHub ${method} ${path}: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function findGistId(): Promise<string | null> {
  const cached = localStorage.getItem(GIST_ID_KEY);
  if (cached) return cached;
  for (let page = 1; page <= 5; page++) {
    const gists = await api<Gist[]>(`/gists?per_page=100&page=${page}`);
    const hit = gists.find((gist) => gist.files && gist.files[GIST_FILENAME]);
    if (hit) {
      localStorage.setItem(GIST_ID_KEY, hit.id);
      return hit.id;
    }
    if (gists.length < 100) break;
  }
  return null;
}

function parseBlocks(content: string): DeviceBlocks {
  const parsed = JSON.parse(content) as Partial<GistContent> | null;
  return parsed && typeof parsed.devices === "object" && parsed.devices !== null ? parsed.devices : {};
}

function gistFileBody(devices: DeviceBlocks): { files: Record<string, { content: string }> } {
  return { files: { [GIST_FILENAME]: { content: JSON.stringify({ devices } satisfies GistContent) } } };
}

// The blocks the gist holds right now (empty when the file is missing or
// its content is corrupt, in which case it is rebuilt from local blocks).
async function readDevices(gistId: string): Promise<DeviceBlocks> {
  const gist = await api<Gist>(`/gists/${gistId}`);
  const file = gist.files && gist.files[GIST_FILENAME];
  try {
    return file && file.content ? parseBlocks(file.content) : {};
  } catch {
    return {};
  }
}

// Pulls every device's block, writes ours back (only if the remote copy
// differs, so periodic re-pulls don't churn the gist), returns all blocks
// (ours included) for merging. Throws on network/auth errors.
export async function syncBlock(ownBlock: StatsBlock): Promise<StatsBlock[]> {
  const gistId = await findGistId();
  if (!gistId) {
    const created = await api<Gist>("/gists", {
      method: "POST",
      body: {
        description: GIST_DESCRIPTION,
        public: false,
        ...gistFileBody({ [ownBlock.deviceId]: ownBlock }),
      },
    });
    localStorage.setItem(GIST_ID_KEY, created.id);
    return [ownBlock];
  }
  const devices = await readDevices(gistId);
  const remoteOwn = devices[ownBlock.deviceId];
  const changed = JSON.stringify(remoteOwn) !== JSON.stringify(ownBlock);
  devices[ownBlock.deviceId] = ownBlock;
  if (changed) {
    await api(`/gists/${gistId}`, { method: "PATCH", body: gistFileBody(devices) });
  }
  return Object.values(devices);
}

// Replaces the gist with just our (freshly reset) block: a full reset
// across every device. Other devices start over on their next sync.
export async function resetRemoteBlocks(ownBlock: StatsBlock): Promise<StatsBlock[]> {
  const gistId = await findGistId();
  if (!gistId) return [ownBlock];
  await api(`/gists/${gistId}`, {
    method: "PATCH",
    body: gistFileBody({ [ownBlock.deviceId]: ownBlock }),
  });
  return [ownBlock];
}

// Drops another device's block from the gist (after its history has been
// absorbed locally, see stats.absorbBlock). Returns the remaining blocks.
export async function removeDeviceBlock(deviceId: string, ownBlock: StatsBlock): Promise<StatsBlock[]> {
  const gistId = await findGistId();
  if (!gistId) return [ownBlock];
  const devices = await readDevices(gistId);
  delete devices[deviceId];
  devices[ownBlock.deviceId] = ownBlock;
  await api(`/gists/${gistId}`, { method: "PATCH", body: gistFileBody(devices) });
  return Object.values(devices);
}
