// A guest session on PokeDoku, the way the site gives every anonymous
// visitor one: NextAuth's `anon` credentials provider mints a temp user,
// and the session cookie (Domain=.pokedoku.com) then authenticates
// api.pokedoku.com. Endpoints beyond /pokemon/all and /puzzle/current
// (stats, archives, guesses) all 401 without it. Kamal authorized the
// guest login on 2026-08-26.
//
// Cookie handling is a deliberately small jar: every cookie either host
// sets is kept by name and sent back to both hosts — fine here because
// all traffic is same-site HTTPS between pokedoku.com and its api
// subdomain.

const SITE = "https://pokedoku.com";
const API = "https://api.pokedoku.com";

export class PokedokuSession {
  private cookies = new Map<string, string>();

  private storeCookies(response: Response): void {
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(";");
      const separator = pair.indexOf("=");
      if (separator > 0) {
        this.cookies.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
      }
    }
  }

  private cookieHeader(): string {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  get hasSessionToken(): boolean {
    return [...this.cookies.keys()].some((name) => name.includes("session-token"));
  }

  async signInAnon(): Promise<void> {
    const csrfResponse = await fetch(`${SITE}/api/auth/csrf`);
    this.storeCookies(csrfResponse);
    const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string };

    const signInResponse = await fetch(`${SITE}/api/auth/callback/anon`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: this.cookieHeader(),
      },
      body: new URLSearchParams({ csrfToken, json: "true" }),
      redirect: "manual",
    });
    this.storeCookies(signInResponse);
    if (!this.hasSessionToken) {
      throw new Error(`anon sign-in got no session cookie (HTTP ${signInResponse.status})`);
    }
  }

  async apiGet<T>(path: string): Promise<T> {
    const response = await fetch(`${API}${path}`, {
      headers: { "Accept-Language": "en", Cookie: this.cookieHeader() },
    });
    if (!response.ok) throw new Error(`GET ${path} → ${response.status}`);
    this.storeCookies(response);
    return (await response.json()) as T;
  }

  async apiPost<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${API}${path}`, {
      method: "POST",
      headers: {
        "Accept-Language": "en",
        "Content-Type": "application/json",
        Cookie: this.cookieHeader(),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`POST ${path} → ${response.status}`);
    this.storeCookies(response);
    return (await response.json()) as T;
  }
}
