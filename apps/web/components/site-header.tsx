import { Heart, UserRound } from "lucide-react"
import Link from "next/link"
import { Suspense } from "react"

import { HeaderSearch } from "@/components/header-search"
import { LogoWordmark } from "@/components/brand/logo"
import { CatalogMenu } from "@/components/catalog-menu"
import { ModeToggle } from "@/components/mode-toggle"
import { GoogleOneTap } from "@/components/auth/google-one-tap"
import { Button } from "@/components/ui/button"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { CustomerMenu } from "@/features/account/components/customer-menu"
import { catalogHref } from "@/features/catalog/catalog-navigation"
import { CartLink } from "@/features/cart/components/cart-link"
import { getApplicationNavigation } from "@/features/vendor-onboarding/data"
import { getCurrentCustomer, getCustomerSessionToken } from "@/lib/auth-sdk"
import { readGoogleCustomerProfile } from "@/lib/google-customer-profile"
import { getStorefrontCategories } from "@/lib/medusa"

async function CategoryLinks() {
  const categories = await getStorefrontCategories()

  return categories.map((category) => (
    <DropdownMenuItem key={category.id} asChild className="min-h-11 px-3">
      <Link href={catalogHref({ categoryId: category.id })}>
        {category.name}
      </Link>
    </DropdownMenuItem>
  ))
}

async function HeaderCustomerMenu() {
  let customer
  try {
    customer = await getCurrentCustomer()
  } catch {
    return (
      <Button asChild variant="ghost" size="icon" className="size-11">
        <Link href="/account" aria-label="Abrir mi cuenta">
          <UserRound className="size-5" strokeWidth={1.75} aria-hidden="true" />
        </Link>
      </Button>
    )
  }

  if (!customer) {
    return (
      <>
        <Button
          asChild
          variant="ghost"
          className="h-11 w-11 p-0 sm:w-auto sm:px-3"
        >
          <Link
            href="/login"
            aria-label="Iniciar sesión"
            title="Iniciar sesión"
          >
            <UserRound
              className="size-5"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <span className="hidden sm:inline">Iniciar sesión</span>
          </Link>
        </Button>
        <GoogleOneTap />
      </>
    )
  }

  const vendorApplication = await getApplicationNavigation()
  const googleProfile = readGoogleCustomerProfile(
    await getCustomerSessionToken(),
    customer.id,
  )

  return (
    <CustomerMenu
      first_name={customer.first_name}
      last_name={customer.last_name}
      email={customer.email}
      googleProfile={googleProfile}
      vendorApplication={vendorApplication}
    />
  )
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 shrink-0 border-b border-border bg-background [--app-header-height:calc(3.75rem_+_1px)] lg:[--app-header-height:calc(4.25rem_+_1px)]">
      <div className="mx-auto grid w-full max-w-[90rem] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 px-4 py-2 sm:gap-x-4 sm:px-6 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:gap-x-6 lg:px-10 lg:py-3">
        <Link
          href="/"
          aria-label="USAPEEK, inicio"
          className="inline-flex min-h-11 w-fit min-w-0 items-center rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring"
        >
          <LogoWordmark width={126} aria-hidden="true" className="h-auto w-[88px] min-[360px]:w-[104px] sm:w-[126px]" />
        </Link>

        <div className="col-span-2 row-start-2 flex min-w-0 items-center gap-2 pb-1 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:pb-0">
          <nav aria-label="Navegación principal" className="shrink-0">
            <CatalogMenu>
              <Suspense
                fallback={
                  <Skeleton
                    className="m-3 h-5 w-40"
                    aria-label="Cargando categorías"
                  />
                }
              >
                <CategoryLinks />
              </Suspense>
            </CatalogMenu>
          </nav>
          <HeaderSearch />
        </div>

        <div className="col-start-2 row-start-1 flex items-center gap-0 sm:gap-1 lg:col-start-3">
          <ModeToggle className="size-11" />
          <Button asChild variant="ghost" size="icon" className="size-11">
            <Link
              href="/account/favorites"
              aria-label="Favoritos"
              title="Favoritos"
            >
              <Heart aria-hidden="true" className="size-5" strokeWidth={1.75} />
            </Link>
          </Button>
          <Suspense
            fallback={
              <Skeleton className="size-11" aria-label="Cargando carrito" />
            }
          >
            <CartLink />
          </Suspense>
          <div className="flex h-11 min-w-0 items-center">
            <Suspense
              fallback={
                <Skeleton
                  role="status"
                  aria-label="Cargando cuenta"
                  className="h-11 w-11 sm:w-36"
                />
              }
            >
              <HeaderCustomerMenu />
            </Suspense>
          </div>
        </div>
      </div>
    </header>
  )
}
