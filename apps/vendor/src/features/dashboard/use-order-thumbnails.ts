"use client";

import { useEffect, useRef, useState } from "react";
import type { HttpTypes } from "@mercurjs/types";
import type { ProductThumbnails } from "../orders/image-data";
import { readDashboardData } from "./live-data";

export function useOrderThumbnails(
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
      const ids = [
        ...new Set(
          (orders ?? []).flatMap((order) =>
            (order.items ?? [])
              .slice(0, 3)
              .flatMap((item) =>
                !item.thumbnail &&
                item.product_id &&
                !next.has(item.product_id) &&
                !attempted.current.has(item.product_id)
                  ? [item.product_id]
                  : [],
              ),
          ),
        ),
      ];
      if (ids.length) {
        const query = new URLSearchParams({ seller_id: sellerId });
        ids.forEach((id) => query.append("id", id));
        const images = await readDashboardData<Record<string, string>>(
          `/seller/dashboard/order-images?${query}`,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        ids.forEach((id) => attempted.current.add(id));
        Object.entries(images).forEach(([id, src]) => next.set(id, src));
      }
      cache.current = next;
      setThumbnails(next);
    }
    void update().catch(() => {});
    return () => controller.abort();
  }, [sellerId, initial, orders]);
  return thumbnails;
}
