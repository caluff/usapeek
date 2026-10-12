import { LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { FeedbackToast } from "@/components/feedback-toast"
import type { AccountActionState } from "@/features/account/types"

export function FormStatus({ state }: { state: AccountActionState }) {
  return <FeedbackToast feedback={state} />
}

export function AccountSubmitButton({
  pending,
  children,
}: {
  pending: boolean
  children: string
}) {
  return (
    <Button
      type="submit"
      variant="accent"
      disabled={pending}
      className="min-h-12 w-full sm:w-auto"
    >
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : null}
      {pending ? "Guardando…" : children}
    </Button>
  )
}
