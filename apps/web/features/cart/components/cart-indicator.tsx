"use client"

import { ShoppingCart } from "lucide-react"
import Link from "next/link"
import { useEffect, useSyncExternalStore } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  getCartCount,
  publishCartSnapshot,
  subscribeCartUpdates,
} from "../cart-events"

export function CartIndicator({
  initialCount,
  snapshotAt,
}: {
  initialCount: number | null
  snapshotAt: number
}) {
  const count = useSyncExternalStore(
    subscribeCartUpdates,
    () => getCartCount(initialCount, snapshotAt),
    () => initialCount,
  )

  useEffect(() => {
    if (initialCount !== null) publishCartSnapshot(initialCount, snapshotAt)
  }, [initialCount, snapshotAt])

  return (
    <Button asChild variant="ghost" size="icon" className="relative size-11">
      <Link
        href="/cart"
        prefetch={false}
        title="Carrito"
        aria-label={
          count === null
            ? "Ver carrito"
            : `Ver carrito, ${count} ${count === 1 ? "producto" : "productos"}`
        }
      >
        <ShoppingCart className="size-5" strokeWidth={1.75} aria-hidden="true" />
        {count !== null && count > 0 ? (
          <Badge
            variant="accent"
            aria-hidden="true"
            className="pointer-events-none absolute -top-0.5 -right-0.5 h-4.5 min-w-4.5 rounded-full px-1 text-[10px] leading-none tabular-nums ring-2 ring-background"
          >
            {count > 99 ? "99+" : count}
          </Badge>
        ) : null}
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {count === null
            ? ""
            : `${count} ${count === 1 ? "producto" : "productos"} en el carrito`}
        </span>
      </Link>
    </Button>
  )
}
