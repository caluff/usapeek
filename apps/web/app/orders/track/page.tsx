import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { SiteFooter } from "@/components/site-footer"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { TrackingAccountAccess } from "@/features/order-tracking/account-access"
import { TrackingContent } from "@/features/order-tracking/tracking-content"

export const metadata: Metadata = {
  title: "Seguimiento de tu pedido",
  description:
    "Consulta el estado y el seguimiento de tu pedido de USAPEEK mediante tu enlace privado de acceso.",
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
  referrer: "no-referrer",
}
export const dynamic = "force-dynamic"

export default function OrderTrackingPage() {
  return (
    <>
      <main className="mx-auto min-h-[60vh] w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-12 lg:py-16">
        <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
          Seguimiento de tu pedido
        </h1>
        <div className="mt-8">
          <TrackingContent
            accountAccess={
              <Suspense
                fallback={
                  <Skeleton
                    className="h-40 w-full sm:h-28"
                    aria-label="Cargando acceso a tu cuenta"
                  />
                }
              >
                <TrackingAccountAccess />
              </Suspense>
            }
          />
        </div>
        <Button asChild variant="outline" className="mt-8">
          <Link href="/search">Seguir explorando</Link>
        </Button>
      </main>
      <SiteFooter />
    </>
  )
}

