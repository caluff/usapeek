import { ArrowUpRight } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"

export function AccountEmptyState({
  icon,
  title,
  children,
}: {
  icon: ReactNode
  title: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center border border-dashed border-border px-6 py-12 text-center">
      <div className="mb-5 text-muted-foreground [&_svg]:size-9">{icon}</div>
      <h2 className="text-xl font-medium">{title}</h2>
      <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
        {children}
      </p>
      <Button asChild variant="outline" className="mt-6">
        <Link href="/search">
          Explorar el catálogo
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </Link>
      </Button>
    </div>
  )
}
