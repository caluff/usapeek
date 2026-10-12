"use client"

import { LoaderCircle, Minus, Plus, Trash2 } from "lucide-react"
import { useActionState } from "react"
import { updateCartItemAction } from "../actions"

export function CartItemQuantity({
  itemId,
  productTitle,
  quantity,
  maxQuantity,
  availabilityLabel,
}: {
  itemId: string
  productTitle: string
  quantity: number
  maxQuantity: number
  availabilityLabel: string
}) {
  const [state, action, isPending] = useActionState(updateCartItemAction, {})
  const isMaximum = quantity >= maxQuantity

  return (
    <form
      action={action}
      className="mt-4 ml-auto w-fit font-sans sm:mt-auto"
    >
      <input type="hidden" name="item_id" value={itemId} />
      <div>
        <p
          role={state.error ? "alert" : "status"}
          className={`mb-2 max-w-48 text-right text-xs ${
            state.error ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {state.error ?? (isPending ? "Guardando…" : availabilityLabel)}
        </p>
        <div className="inline-grid min-h-11 grid-cols-[2.75rem_3rem_2.75rem] border border-border">
          <button
            type="submit"
            name={quantity === 1 ? "remove" : "quantity"}
            value={quantity === 1 ? "true" : quantity - 1}
            disabled={isPending}
            aria-label={
              quantity === 1
                ? `Eliminar ${productTitle} del carrito`
                : `Reducir cantidad de ${productTitle}`
            }
            className="grid min-h-11 place-items-center border-r border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            {quantity === 1 ? (
              <Trash2 className="size-4" aria-hidden="true" />
            ) : (
              <Minus className="size-4" aria-hidden="true" />
            )}
          </button>

          <output
            aria-live="polite"
            aria-label={`${quantity} unidades en el carrito`}
            className="grid min-h-11 place-items-center text-sm font-bold tabular-nums"
          >
            {isPending ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              quantity
            )}
          </output>

          <button
            type="submit"
            name="quantity"
            value={quantity + 1}
            disabled={isPending || isMaximum}
            aria-label={`Aumentar cantidad de ${productTitle}`}
            title={
              isMaximum
                ? "Alcanzaste la cantidad máxima disponible"
                : undefined
            }
            className="grid min-h-11 place-items-center border-l border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <Plus className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </form>
  )
}
