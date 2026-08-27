// Mirrors archived puzzles into Firestore (`pickArchive/{puzzleId}`), so
// the archive is queryable alongside the Batch 6 user-sync data. The
// repo's public/archive files stay canonical; this is the database copy.
//
// Writes go through the Firestore REST API as a service account (admin
// writes bypass security rules, which stay locked to public-read).
// Dormant until the FIREBASE_SERVICE_ACCOUNT env var holds the service
// account's JSON key — the same ships-dark pattern as firebaseConfig.ts.
import { createSign } from "node:crypto";
import type { PickStatsPuzzle } from "../src/data/types.ts";

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

// Firestore forbids nested arrays, so a cell's picks — [[id, count], …]
// in the archive files — become a {pokemonId: count} map (order is
// recoverable by sorting on count). Everything else mirrors as-is.
export function archiveDocJson(puzzle: PickStatsPuzzle): Record<string, unknown> {
  return {
    id: puzzle.id,
    ...(puzzle.date ? { date: puzzle.date } : {}),
    ...(puzzle.spec ? { spec: puzzle.spec } : {}),
    cells: puzzle.cells.map((cell) => ({
      total: cell.total,
      picks: Object.fromEntries(cell.picks.map(([pokemonId, count]) => [String(pokemonId), count])),
    })),
  };
}

// Plain JSON → Firestore REST typed values
export function toFirestoreValue(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === "string") return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  return { mapValue: { fields: toFirestoreFields(value as Record<string, unknown>) } };
}

export function toFirestoreFields(json: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(json).map(([key, value]) => [key, toFirestoreValue(value)]));
}

const base64url = (data: string | Buffer): string =>
  Buffer.from(data).toString("base64url");

async function getAccessToken(account: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/datastore",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signature = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(account.private_key);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${base64url(signature)}`,
    }),
  });
  if (!response.ok) throw new Error(`token exchange → ${response.status}`);
  const { access_token } = (await response.json()) as { access_token: string };
  return access_token;
}

export class FirestoreArchive {
  private readonly account: ServiceAccount;
  private readonly token: string;

  private constructor(account: ServiceAccount, token: string) {
    this.account = account;
    this.token = token;
  }

  // null when FIREBASE_SERVICE_ACCOUNT is unset — mirroring stays dark
  static async fromEnv(): Promise<FirestoreArchive | null> {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) return null;
    const account = JSON.parse(raw) as ServiceAccount;
    return new FirestoreArchive(account, await getAccessToken(account));
  }

  async mirror(puzzle: PickStatsPuzzle): Promise<void> {
    const url =
      `https://firestore.googleapis.com/v1/projects/${this.account.project_id}` +
      `/databases/(default)/documents/pickArchive/${puzzle.id}`;
    const response = await fetch(url, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields: toFirestoreFields(archiveDocJson(puzzle)) }),
    });
    if (!response.ok) throw new Error(`mirror puzzle ${puzzle.id} → ${response.status}`);
  }
}
