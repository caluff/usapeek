import { Skeleton } from "@/components/ui/skeleton"
import { AccountHeading } from "@/features/account/components/account-heading"

export default function SellLoading() {
  return (
    <div className="max-w-4xl">
      <AccountHeading
        title="Vender en usapeek"
        description="Un nuevo espacio para tu negocio, con la cuenta que ya tienes."
      />
      <div role="status" aria-label="Cargando tu solicitud" className="space-y-6">
        <Skeleton className="h-12 w-full" />
        <div className="space-y-6 border border-border bg-card p-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid gap-6 sm:grid-cols-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="ml-auto h-11 w-48" />
        </div>
        <span className="sr-only">Cargando tu solicitud…</span>
      </div>
    </div>
  )
}
