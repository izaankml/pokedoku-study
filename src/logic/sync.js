// Cross-device progress sharing through a private GitHub Gist.
//
// The gist holds one JSON file with one stat block per device; every
// device only rewrites its own block, so concurrent devices can never
// clobber each other — merging is pure addition (stats.mergeBlocks).
//
// Requires a fine-grained personal access token with ONLY the "Gists"
// read/write permission. It is kept in localStorage on each device.

const TOKEN_KEY = "pokedoku-study:gist-token";
const GIST_ID_KEY = "pokedoku-study:gist-id";
const GIST_FILENAME = "pokedoku-study-progress.json";
const GIST_DESCRIPTION = "PokeDoku Study progress (managed by the app)";
const API = "https://api.github.com";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setToken(token) {
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

export function handoffUrl() {
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
export function consumeHandoffFromUrl() {
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

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`GitHub ${method} ${path}: ${res.status}`);
  }
  return res.json();
}

async function findGistId() {
  const cached = localStorage.getItem(GIST_ID_KEY);
  if (cached) return cached;
  for (let page = 1; page <= 5; page++) {
    const gists = await api(`/gists?per_page=100&page=${page}`);
    const hit = gists.find((g) => g.files && g.files[GIST_FILENAME]);
    if (hit) {
      localStorage.setItem(GIST_ID_KEY, hit.id);
      return hit.id;
    }
    if (gists.length < 100) break;
  }
  return null;
}

function parseBlocks(content) {
  const parsed = JSON.parse(content);
  return parsed && typeof parsed.devices === "object" ? parsed.devices : {};
}

// Pulls every device's block, writes ours back (only if the remote copy
// differs, so periodic re-pulls don't churn the gist), returns all blocks
// (ours included) for merging. Throws on network/auth errors.
export async function syncBlock(ownBlock) {
  const gistId = await findGistId();
  if (!gistId) {
    await api("/gists", {
      method: "POST",
      body: {
        description: GIST_DESCRIPTION,
        public: false,
        files: {
          [GIST_FILENAME]: {
            content: JSON.stringify({ devices: { [ownBlock.deviceId]: ownBlock } }),
          },
        },
      },
    }).then((g) => localStorage.setItem(GIST_ID_KEY, g.id));
    return [ownBlock];
  }
  const gist = await api(`/gists/${gistId}`);
  const file = gist.files && gist.files[GIST_FILENAME];
  let devices = {};
  try {
    devices = file ? parseBlocks(file.content) : {};
  } catch {
    devices = {}; // corrupt remote content -> rebuild from local blocks
  }
  const remoteOwn = devices[ownBlock.deviceId];
  const changed = JSON.stringify(remoteOwn) !== JSON.stringify(ownBlock);
  devices[ownBlock.deviceId] = ownBlock;
  if (changed) {
    await api(`/gists/${gistId}`, {
      method: "PATCH",
      body: {
        files: { [GIST_FILENAME]: { content: JSON.stringify({ devices }) } },
      },
    });
  }
  return Object.values(devices);
}

// Drops another device's block from the gist (after its history has been
// absorbed locally — see stats.absorbBlock). Returns the remaining blocks.
export async function removeDeviceBlock(deviceId, ownBlock) {
  const gistId = await findGistId();
  if (!gistId) return [ownBlock];
  const gist = await api(`/gists/${gistId}`);
  const file = gist.files && gist.files[GIST_FILENAME];
  let devices = {};
  try {
    devices = file ? parseBlocks(file.content) : {};
  } catch {
    devices = {};
  }
  delete devices[deviceId];
  devices[ownBlock.deviceId] = ownBlock;
  await api(`/gists/${gistId}`, {
    method: "PATCH",
    body: { files: { [GIST_FILENAME]: { content: JSON.stringify({ devices }) } } },
  });
  return Object.values(devices);
}
