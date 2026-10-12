"use client";

import { useEffect, useRef, useState } from "react";
import type { HttpTypes } from "@mercurjs/types";
import type { ProductThumbnails } from "./image-data";
import { missingListThumbnailIds, readListThumbnails } from "./list-thumbnails";

export function useListThumbnails(
  sellerId: string,
  initial: Promise<ProductThumbnails>,
  orders?: HttpTypes.VendorOrderListResponse["orders"],
) {
  const cache = useRef(new Map<string, string>());
  const attempted = useRef(new Set<string>());
  const [thumbnails, setThumbnails] = useState<ProductThumbnails>(
    () => new Map(),
  );
  useEffect(() => {
    const controller = new AbortController();
    async function update() {
      const base = await initial;
      if (controller.signal.aborted) return;
      const next = new Map([...base, ...cache.current]);
      const ids = missingListThumbnailIds(
        orders ?? [],
        next,
        attempted.current,
      );
      if (ids.length) {
        const images = await readListThumbnails(
          sellerId,
          ids,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        ids.forEach((id) => attempted.current.add(id));
        images.forEach((src, id) => next.set(id, src));
      }
      cache.current = next;
      setThumbnails(next);
    }
    void update().catch(() => {});
    return () => controller.abort();
  }, [sellerId, initial, orders]);
  return thumbnails;
}
