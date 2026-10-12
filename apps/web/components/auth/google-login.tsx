"use client"

import { useActionState } from "react"
import { LoaderCircle } from "lucide-react"
import Image from "next/image"
import { startCustomerGoogleAction } from "@/app/google-auth-actions"
import { Button } from "@/components/ui/button"
import { INITIAL_AUTH_STATE } from "@/lib/auth-utils"

export function GoogleLogin({
  next,
  link = false,
  orderTrackingToken,
}: {
  next: string
  link?: boolean
  orderTrackingToken?: string
}) {
  const [state, action, pending] = useActionState(
    startCustomerGoogleAction,
    INITIAL_AUTH_STATE,
  )
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="link" value={String(link)} />
      {orderTrackingToken ? (
        <input type="hidden" name="orderTrackingToken" value={orderTrackingToken} />
      ) : null}
      <Button
        type="submit"
        variant="outline"
        className="w-full"
        disabled={pending}
      >
        {pending ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Image
            src="/icons/google.png"
            alt=""
            width={20}
            height={20}
            className="size-5"
          />
        )}
        {pending
          ? "Conectando…"
          : link
            ? "Vincular mi cuenta de Google"
            : "Continuar con Google"}
      </Button>
      {state.message ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
    </form>
  )
}
