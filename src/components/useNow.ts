import { useEffect, useState } from "react";

// Re-render every `ms` so relative times, and anything else that turns on
// the clock (cards falling due), stay fresh.
export function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
