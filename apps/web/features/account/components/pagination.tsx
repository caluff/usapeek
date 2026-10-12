import { ChevronLeft, ChevronRight } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export function AccountPagination({
  page,
  count,
  pageSize,
  href,
}: {
  page: number
  count: number
  pageSize: number
  href: string
}) {
  const pages = Math.ceil(count / pageSize)
  if (pages <= 1) return null
  return (
    <nav
      aria-label="Paginación"
      className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-6"
    >
      {page > 1 ? (
        <Button asChild variant="outline">
          <Link href={`${href}?page=${page - 1}`}>
            <ChevronLeft className="size-4" aria-hidden="true" />
            Anterior
          </Link>
        </Button>
      ) : (
        <span />
      )}
      <span className="text-xs text-muted-foreground">
        {page} / {pages}
      </span>
      {page < pages ? (
        <Button asChild variant="outline">
          <Link href={`${href}?page=${page + 1}`}>
            Siguiente
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      ) : (
        <span />
      )}
    </nav>
  )
}
