"use client"

import type { HttpTypes } from "@medusajs/types"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { updateCartItemAction } from "../actions"
import { publishCartSnapshot } from "../cart-events"
import { subscribeCartItemAdded } from "../cart-sheet-events"
import { formatMoney } from "../presentation"
import { getCartSheetAction } from "../sheet-actions"
import { CartSheetItem } from "./cart-sheet-item"

export function CartSheet() {
  const [isOpen, setIsOpen] = useState(false)
  const [cart, setCart] = useState<HttpTypes.StoreCart | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingItemId, setPendingItemId] = useState<string | null>(null)
  const requestRef = useRef(0)
  const sessionRef = useRef(0)
  const isUpdatingRef = useRef(false)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  const loadCart = useCallback(async () => {
    const requestId = ++requestRef.current
    setIsLoading(true)
    setError(null)
    try {
      const result = await getCartSheetAction()
      if (!result.error && typeof result.snapshotAt === "number") {
        publishCartSnapshot(
          result.cart?.items?.reduce(
            (count, item) => count + item.quantity,
            0,
          ) ?? 0,
          result.snapshotAt,
        )
      }
      if (requestId !== requestRef.current) return
      if (result.error) setError(result.error)
      else setCart(result.cart ?? null)
    } catch {
      if (requestId === requestRef.current)
        setError("No pudimos cargar el carrito. Vuelve a intentarlo.")
    } finally {
      if (requestId === requestRef.current) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeCartItemAdded((trigger) => {
      sessionRef.current += 1
      returnFocusRef.current = trigger
      setCart(null)
      setIsOpen(true)
      void loadCart()
    })
    return () => {
      unsubscribe()
      requestRef.current += 1
    }
  }, [loadCart])

  function closeSheet() {
    sessionRef.current += 1
    requestRef.current += 1
    setIsOpen(false)
  }

  async function updateQuantity(itemId: string, quantity: number) {
    if (isUpdatingRef.current) return
    const sessionId = sessionRef.current
    isUpdatingRef.current = true
    setPendingItemId(itemId)
    setError(null)
    const form = new FormData()
    form.set("item_id", itemId)
    if (quantity === 0) form.set("remove", "true")
    else form.set("quantity", String(quantity))
    try {
      const result = await updateCartItemAction({}, form)
      if (result.error) {
        if (sessionId === sessionRef.current) setError(result.error)
      } else await loadCart()
    } catch {
      if (sessionId === sessionRef.current)
        setError(
          "No pudimos confirmar el cambio. Revisa el carrito antes de intentarlo otra vez.",
        )
    } finally {
      isUpdatingRef.current = false
      setPendingItemId(null)
    }
  }

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) closeSheet()
      }}
    >
      <SheetContent
        side="right"
        aria-describedby={undefined}
        className="w-48 max-w-full gap-0 sm:max-w-48 [&>button:last-child]:hidden"
        onCloseAutoFocus={(event) => {
          if (returnFocusRef.current?.isConnected) {
            event.preventDefault()
            returnFocusRef.current.focus()
          }
        }}
      >
        <div className="shrink-0 px-4 pt-5 pb-4">
          <SheetTitle className="sr-only">Carrito</SheetTitle>
          <div
            className="flex flex-col items-center gap-1 text-center"
            aria-live="polite"
            aria-busy={isLoading}
          >
            <span className="text-xs text-muted-foreground">
              Total del carrito
            </span>
            {isLoading && !cart ? (
              <Skeleton className="h-7 w-28" aria-label="Cargando total" />
            ) : cart ? (
              <span className="text-xl font-bold tabular-nums">
                {formatMoney(cart.total ?? 0, cart.currency_code)}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
          <Button
            asChild
            variant="accent"
            className="mt-3 min-h-11 w-full text-xs"
          >
            <Link href="/cart" onClick={closeSheet}>
              Ir al carrito
            </Link>
          </Button>
        </div>
        {error ? (
          <div className="shrink-0 px-4 pb-4">
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              disabled={isLoading || pendingItemId !== null}
              onClick={() => void loadCart()}
            >
              Reintentar
            </Button>
          </div>
        ) : null}
        <div
          className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
          aria-busy={isLoading || pendingItemId !== null}
        >
          {isLoading && !cart ? (
            <div
              role="status"
              aria-label="Cargando productos del carrito"
              className="space-y-8 pt-4"
            >
              {[0, 1].map((index) => (
                <div key={index} className="flex flex-col items-center gap-3">
                  <Skeleton className="size-32" />
                  <Skeleton className="h-8 w-32" />
                </div>
              ))}
            </div>
          ) : cart?.items?.length ? (
            <ul>
              {cart.items.map((item) => (
                <CartSheetItem
                  key={item.id}
                  item={item}
                  disabled={
                    isLoading || pendingItemId !== null || Boolean(error)
                  }
                  isPending={pendingItemId === item.id}
                  onQuantityChange={(itemId, quantity) =>
                    void updateQuantity(itemId, quantity)
                  }
                  onNavigate={closeSheet}
                />
              ))}
            </ul>
          ) : !error && !isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Tu carrito está vacío.
            </p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
