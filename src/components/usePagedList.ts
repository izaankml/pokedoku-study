import { useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";

// Long lists render in batches: `page` items at once, `page` more each
// time the sentinel scrolls near (600px ahead). Render the sentinel —
// attach `sentinelRef` to an empty element after the list — only while
// `done` is false. A new `items` array starts the batching over.
export function usePagedList<T>(
  items: readonly T[],
  page = 60,
): { shown: readonly T[]; done: boolean; sentinelRef: MutableRefObject<HTMLDivElement | null> } {
  const [limit, setLimit] = useState(page);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => setLimit(page), [items, page]);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || limit >= items.length) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setLimit((current) => Math.min(current + page, items.length));
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [limit, items, page]);
  return {
    shown: items.length > limit ? items.slice(0, limit) : items,
    done: limit >= items.length,
    sentinelRef,
  };
}
