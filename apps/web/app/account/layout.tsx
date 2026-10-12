import { ArrowLeft, LogOut } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { Suspense, type ReactNode } from "react"
import { logoutCustomerAction } from "@/app/auth-actions"
import { SiteFooter } from "@/components/site-footer"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AccountNav,
  AccountVendorLink,
} from "@/features/account/components/account-nav"
import { getAccount } from "@/features/account/data"
import { getApplicationNavigation } from "@/features/vendor-onboarding/data"

export const metadata: Metadata = {
  description:
    "Administra tu perfil, direcciones, favoritos y pedidos desde tu cuenta de USAPEEK.",
  robots: { index: false, follow: false },
}
export const dynamic = "force-dynamic"

export default async function AccountLayout({
  children,
}: {
  children: ReactNode
}) {
  const { customer } = await getAccount()
  const vendorApplication = getApplicationNavigation()
  return (
    <>
      <a
        href="#account-content"
        className="fixed top-3 left-4 z-50 -translate-y-20 bg-primary px-4 py-3 text-sm text-primary-foreground focus:translate-y-0"
      >
        Saltar al contenido
      </a>
      <main className="mx-auto grid w-full max-w-[90rem] flex-1 gap-10 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-14 lg:px-10 lg:py-16">
        <aside className="lg:sticky lg:top-28 lg:self-start">
          <p className="text-2xl font-medium tracking-tight">
            Hola, {customer.first_name || "de nuevo"}
          </p>
          <p className="mt-2 mb-7 text-sm text-muted-foreground">
            Tu espacio, a tu manera.
          </p>
          <AccountNav
            vendorApplicationSlot={
              <Suspense
                fallback={
                  <Skeleton
                    className="h-12 w-full"
                    aria-label="Cargando estado de vendedor"
                  />
                }
              >
                <AccountNavigation application={vendorApplication} />
              </Suspense>
            }
          />
          <form
            action={logoutCustomerAction}
            className="mt-6 border-t border-border pt-4"
          >
            <Button
              type="submit"
              variant="ghost"
              className="w-full justify-start px-3 text-muted-foreground"
            >
              <LogOut className="size-4" aria-hidden="true" />
              Cerrar sesión
            </Button>
          </form>
        </aside>
        <div id="account-content" className="min-w-0 pb-8">
          <Link
            href="/search"
            className="mb-6 inline-flex min-h-11 items-center gap-2 text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Volver a la tienda
          </Link>
          {children}
        </div>
      </main>
      <SiteFooter />
    </>
  )
}

async function AccountNavigation({
  application,
}: {
  application: ReturnType<typeof getApplicationNavigation>
}) {
  return <AccountVendorLink vendorApplication={await application} />
}
