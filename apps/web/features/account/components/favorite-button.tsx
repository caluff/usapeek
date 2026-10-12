"use client"

import { Heart, LoaderCircle } from "lucide-react"
import Link from "next/link"
import { useActionState } from "react"

import { Button } from "@/components/ui/button"
import { FeedbackToast } from "@/components/feedback-toast"
import { setFavoriteAction } from "@/features/account/actions"
import { INITIAL_ACCOUNT_STATE } from "@/features/account/types"
import { cn } from "@/lib/utils"

export function FavoriteButton({
  productId,
  saved,
  authenticated,
  compact = false,
}: {
  productId: string
  saved: boolean
  authenticated: boolean
  compact?: boolean
}) {
  const [state, action, pending] = useActionState(
    setFavoriteAction,
    INITIAL_ACCOUNT_STATE,
  )
  const label = saved ? "Quitar de favoritos" : "Guardar en favoritos"
  if (!authenticated) {
    return (
      <Button asChild variant="outline" size={compact ? "icon" : "default"}>
        <Link
          href="/login?next=%2Faccount%2Ffavorites"
          aria-label="Inicia sesión para guardar favoritos"
        >
          <Heart className="size-4" aria-hidden="true" />
          {compact ? null : "Guardar favorito"}
        </Link>
      </Button>
    )
  }
  return (
    <form action={action} className={compact ? "relative" : "space-y-2"}>
      <input type="hidden" name="product_id" value={productId} />
      <input type="hidden" name="saved" value={String(!saved)} />
      <Button
        type="submit"
        variant="outline"
        size={compact ? "icon" : "default"}
        disabled={pending}
        aria-label={label}
        aria-pressed={saved}
        className={cn(saved && "text-brand-accent-text", !compact && "w-full")}
      >
        {pending ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Heart
            className={cn("size-4", saved && "fill-current")}
            aria-hidden="true"
          />
        )}
        {compact ? null : label}
      </Button>
      <FeedbackToast feedback={state} />
    </form>
  )
}
