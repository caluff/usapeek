import { Skeleton } from "@/components/ui/skeleton"

export default function AccountLoading() {
  return (
    <div role="status" aria-label="Cargando tu cuenta" className="space-y-6">
      <Skeleton className="h-10 w-64 max-w-full" />
      <Skeleton className="h-5 w-96 max-w-full" />
      <div className="grid gap-6 sm:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  )
}
