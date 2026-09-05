import { useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";

// Long lists render in batches: `page` items at once, `page` more each
// time the sentinel scrolls near. Attach `sentinelRef` to an empty element
// after the list, rendered only while `done` is false. A new `items` array
// starts the batching over.
export function usePagedList<T>(
  items: readonly T[],
  page = 60,
): { shown: readonly T[]; done: boolean; sentinelRef: MutableRefObject<HTMLDivElement | null> } {
  // The limit is remembered with the list it belongs to, so a new list
  // starts over on the same render instead of an effect later.
  const [paged, setPaged] = useState({ items, page, limit: page });
  const limit = paged.items === items && paged.page === page ? paged.limit : page;
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || limit >= items.length) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setPaged((current) => {
            const shownSoFar = current.items === items && current.page === page ? current.limit : page;
            return { items, page, limit: Math.min(shownSoFar + page, items.length) };
          });
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
