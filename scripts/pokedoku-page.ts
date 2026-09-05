// The puzzle a pokedoku.com page carries. Next.js streams the server-
// rendered data as `self.__next_f.push([1, "<chunk>"])` script tags; the
// chunks concatenate into the React Server Components payload, which holds
// the puzzle as `"puzzle":{…}` in the same shape /api/puzzle/current
// returns. The home page carries the current puzzle; /puzzle/<date>
// carries that day's, for a signed-in user.

export interface EmbeddedPuzzle extends Record<string, unknown> {
  id: number;
  date: string;
}

// The RSC payload: every push's string chunk, in order
function rscPayload(html: string): string {
  let payload = "";
  for (const [, arrayText] of html.matchAll(/self\.__next_f\.push\((\[.*?\])\)<\/script>/gs)) {
    try {
      const parsed = JSON.parse(arrayText) as unknown;
      if (Array.isArray(parsed) && typeof parsed[1] === "string") payload += parsed[1];
    } catch {
      // a push that isn't a plain [n, "chunk"] pair
    }
  }
  return payload;
}

// The JSON object starting at text[start] (an opening brace), or null if
// it never closes; strings and their escapes are skipped over
function balancedObject(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (inString) {
      if (char === "\\") index += 1;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

const isEmbeddedPuzzle = (value: unknown): value is EmbeddedPuzzle =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { id?: unknown }).id === "number" &&
  typeof (value as { date?: unknown }).date === "string" &&
  "x1" in value &&
  "y1" in value;

// The first well-formed puzzle in the page's payload, or null
export function extractEmbeddedPuzzle(html: string): EmbeddedPuzzle | null {
  const payload = rscPayload(html);
  const marker = '"puzzle":';
  let from = 0;
  for (;;) {
    const keyAt = payload.indexOf(marker, from);
    if (keyAt === -1) return null;
    const objectAt = keyAt + marker.length;
    from = objectAt;
    if (payload[objectAt] !== "{") continue;
    const objectText = balancedObject(payload, objectAt);
    if (!objectText) return null;
    try {
      const parsed = JSON.parse(objectText) as unknown;
      if (isEmbeddedPuzzle(parsed)) return parsed;
    } catch {
      // not JSON after all; keep looking
    }
  }
}
