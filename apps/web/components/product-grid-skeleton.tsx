import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export function ProductGridSkeleton({
  className = "grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4",
  count = 4,
}: {
  className?: string
  count?: number
}) {
  return (
    <div
      aria-busy="true"
      aria-label="Cargando productos"
      className={cn("grid", className)}
    >
      {Array.from({ length: count }, (_, index) => (
        <Card key={index} className="gap-0 overflow-hidden">
          <Skeleton className="aspect-[4/5] w-full" />
          <div className="space-y-3 p-4 sm:p-5">
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </Card>
      ))}
    </div>
  )
}
