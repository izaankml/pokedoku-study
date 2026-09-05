// Cross-device progress sharing through Firestore, keyed by a Google
// account; the successor to the gist sync in sync.ts.
//
// One doc per device block at users/{uid}/blocks/{deviceId}. Each device
// writes only its own doc, so devices never clobber each other. The block
// is one JSON string field: Firestore field paths reject some map keys,
// and blocks are only ever read whole.
//
// The firebase SDK is loaded by dynamic import() on first use, so users
// who never sign in download none of it. Auth persistence is the SDK
// default, so a device signs in once.

import { firebaseConfig, isFirebaseConfigured } from "./firebaseConfig.ts";
import type { StatsBlock } from "./stats.ts";

export interface CloudAccount {
  uid: string;
  email: string;
  displayName: string;
}

// One users/{uid}/blocks doc, still serialized.
export interface BlockDoc {
  deviceId: string;
  json: string;
}

// The auth + Firestore surface this module needs. The real one is
// built on the dynamically imported firebase modules; tests inject a
// fake through _setBackendForTests.
export interface CloudBackend {
  signIn(): Promise<CloudAccount>;
  signOut(): Promise<void>;
  // Resolves once the SDK has restored (or ruled out) a persisted user.
  restoreUser(): Promise<CloudAccount | null>;
  listBlocks(uid: string): Promise<BlockDoc[]>;
  writeBlock(uid: string, deviceId: string, json: string): Promise<void>;
  // One atomic batch: delete these device docs, then write this one.
  applyBatch(uid: string, deleteIds: string[], write: BlockDoc | null): Promise<void>;
}

// Marks that this device chose Google sync, so the next startup knows
// to load firebase and restore the session before falling back to the
// legacy gist path.
const SESSION_KEY = "pokedoku-study:google-session";

let backendPromise: Promise<CloudBackend> | null = null;
let account: CloudAccount | null = null;

function loadBackend(): Promise<CloudBackend> {
  if (!backendPromise) {
    if (!isFirebaseConfigured) {
      return Promise.reject(new Error("Google sync is not configured for this build"));
    }
    backendPromise = buildFirebaseBackend();
  }
  return backendPromise;
}

// Kick off the SDK download early (when a sign-in button renders) so the
// popup call in the click handler isn't stuck behind it; Safari only
// tolerates a short gap between the click and window.open.
export function preloadCloud(): void {
  if (isFirebaseConfigured) void loadBackend().catch(() => undefined);
}

export function hasCloudSession(): boolean {
  return localStorage.getItem(SESSION_KEY) !== null;
}

export function currentAccount(): CloudAccount | null {
  return account;
}

export async function signIn(): Promise<CloudAccount> {
  const backend = await loadBackend();
  account = await backend.signIn();
  localStorage.setItem(SESSION_KEY, account.uid);
  return account;
}

export async function signOutGoogle(): Promise<void> {
  const backend = await loadBackend();
  await backend.signOut();
  account = null;
  localStorage.removeItem(SESSION_KEY);
}

// Call once on startup when hasCloudSession(). Resolves with the restored
// account, or null when it was revoked or signed out elsewhere, in which
// case the flag is cleared so the app falls back to signed-out.
export async function restoreAccount(): Promise<CloudAccount | null> {
  if (!hasCloudSession()) return null;
  if (!isFirebaseConfigured && !backendPromise) {
    // Stale flag from a build that had config (or a rolled-back one).
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
  const backend = await loadBackend();
  account = await backend.restoreUser();
  if (!account) localStorage.removeItem(SESSION_KEY);
  return account;
}

function requireUid(): string {
  if (!account) throw new Error("Not signed in");
  return account.uid;
}

type DeviceBlocks = Record<string, StatsBlock>;

// A doc whose json is corrupt is skipped; the owning device rebuilds it
// from its local block on its next write.
function parseBlockDocs(docs: BlockDoc[]): DeviceBlocks {
  const devices: DeviceBlocks = {};
  for (const entry of docs) {
    try {
      devices[entry.deviceId] = JSON.parse(entry.json) as StatsBlock;
    } catch {
      // skip
    }
  }
  return devices;
}

// Pulls every device's block, writes ours back (only if the remote copy
// differs, so periodic re-pulls don't churn writes), returns all blocks
// (ours included) for merging. Throws on network/auth errors.
export async function syncBlock(ownBlock: StatsBlock): Promise<StatsBlock[]> {
  const uid = requireUid();
  const backend = await loadBackend();
  const devices = parseBlockDocs(await backend.listBlocks(uid));
  const remoteOwn = devices[ownBlock.deviceId];
  const changed = JSON.stringify(remoteOwn) !== JSON.stringify(ownBlock);
  devices[ownBlock.deviceId] = ownBlock;
  if (changed) {
    await backend.writeBlock(uid, ownBlock.deviceId, JSON.stringify(ownBlock));
  }
  return Object.values(devices);
}

// Replaces the account's blocks with just our (freshly reset) one: a
// full reset across every device. Others start over on their next sync.
export async function resetRemoteBlocks(ownBlock: StatsBlock): Promise<StatsBlock[]> {
  const uid = requireUid();
  const backend = await loadBackend();
  const existing = await backend.listBlocks(uid);
  const deleteIds = existing.map((entry) => entry.deviceId).filter((deviceId) => deviceId !== ownBlock.deviceId);
  await backend.applyBatch(uid, deleteIds, { deviceId: ownBlock.deviceId, json: JSON.stringify(ownBlock) });
  return [ownBlock];
}

// Drops another device's block (after its history has been absorbed
// locally, see stats.absorbBlock). Returns the remaining blocks.
export async function removeDeviceBlock(deviceId: string, ownBlock: StatsBlock): Promise<StatsBlock[]> {
  const uid = requireUid();
  const backend = await loadBackend();
  const devices = parseBlockDocs(await backend.listBlocks(uid));
  delete devices[deviceId];
  devices[ownBlock.deviceId] = ownBlock;
  await backend.applyBatch(uid, [deviceId], { deviceId: ownBlock.deviceId, json: JSON.stringify(ownBlock) });
  return Object.values(devices);
}

// Gist to Google migration: copy gist blocks Firestore hasn't seen. Never
// overwrites an existing doc (Firestore is fresher once a device has
// migrated); our own block is skipped, since it syncs normally right
// after. Returns how many blocks were imported.
export async function importLegacyBlocks(blocks: StatsBlock[], ownDeviceId: string): Promise<number> {
  const uid = requireUid();
  const backend = await loadBackend();
  const existing = new Set((await backend.listBlocks(uid)).map((entry) => entry.deviceId));
  let imported = 0;
  for (const legacyBlock of blocks) {
    if (legacyBlock.deviceId === ownDeviceId || existing.has(legacyBlock.deviceId)) continue;
    await backend.writeBlock(uid, legacyBlock.deviceId, JSON.stringify(legacyBlock));
    imported++;
  }
  return imported;
}

// ---- the real backend ----

async function buildFirebaseBackend(): Promise<CloudBackend> {
  const [{ initializeApp }, authModule, firestoreModule] = await Promise.all([
    import("firebase/app"),
    import("firebase/auth"),
    import("firebase/firestore/lite"),
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = authModule.getAuth(app);
  const db = firestoreModule.getFirestore(app);
  const { collection, doc, getDocs, setDoc, serverTimestamp, writeBatch } = firestoreModule;

  const toAccount = (user: { uid: string; email: string | null; displayName: string | null }): CloudAccount => ({
    uid: user.uid,
    email: user.email ?? "",
    displayName: user.displayName ?? "",
  });
  const blockDoc = (uid: string, deviceId: string) => doc(db, "users", uid, "blocks", deviceId);

  return {
    async signIn() {
      const provider = new authModule.GoogleAuthProvider();
      // signInWithRedirect is broken on Safari for a GitHub Pages origin
      // (third-party storage partitioning); popup works everywhere,
      // including installed-PWA standalone mode.
      const credential = await authModule.signInWithPopup(auth, provider);
      return toAccount(credential.user);
    },
    async signOut() {
      await authModule.signOut(auth);
    },
    restoreUser() {
      return new Promise((resolve) => {
        const unsubscribe = authModule.onAuthStateChanged(auth, (user) => {
          unsubscribe();
          resolve(user ? toAccount(user) : null);
        });
      });
    },
    async listBlocks(uid) {
      const snapshot = await getDocs(collection(db, "users", uid, "blocks"));
      return snapshot.docs.flatMap((docSnapshot) => {
        const json = (docSnapshot.data() as { json?: unknown }).json;
        return typeof json === "string" ? [{ deviceId: docSnapshot.id, json }] : [];
      });
    },
    async writeBlock(uid, deviceId, json) {
      // updatedAt is debugging metadata only; merge semantics live in
      // stats.mergeBlocks.
      await setDoc(blockDoc(uid, deviceId), { json, updatedAt: serverTimestamp() });
    },
    async applyBatch(uid, deleteIds, write) {
      const batch = writeBatch(db);
      for (const deviceId of deleteIds) batch.delete(blockDoc(uid, deviceId));
      if (write) batch.set(blockDoc(uid, write.deviceId), { json: write.json, updatedAt: serverTimestamp() });
      await batch.commit();
    },
  };
}

// ---- test seam ----

// Replaces the lazily-built firebase backend (and signs out). Pass null
// to reset to the real one.
export function _setBackendForTests(backend: CloudBackend | null): void {
  backendPromise = backend ? Promise.resolve(backend) : null;
  account = null;
}
