import { ArrowRight } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"
import { LogoWordmark } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"
import { CookiePreferencesButton } from "@/features/cookie-consent/components/cookie-preferences-button"

const FOOTER_LINK_GROUPS = [
  {
    title: "Tus compras",
    links: [
      { label: "Favoritos", href: "/account/favorites" },
      { label: "Carrito", href: "/cart" },
      { label: "Mis pedidos", href: "/account/orders" },
    ],
  },
  {
    title: "Mi cuenta",
    links: [
      { label: "Mi perfil", href: "/account" },
      { label: "Mis direcciones", href: "/account/addresses" },
    ],
  },
]

function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="flex min-h-11 w-fit max-w-full items-center rounded-sm py-2 text-sm leading-5 text-muted-foreground underline-offset-4 outline-none hover:text-brand-accent-text hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {children}
    </Link>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background text-foreground">
      <div className="mx-auto w-full max-w-[90rem] px-4 sm:px-6 lg:px-10">
        <div className="grid gap-10 py-10 sm:py-12 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-10 lg:py-14 xl:grid-cols-[18rem_minmax(0,1fr)] xl:gap-12">
          <div className="lg:border-r lg:border-border lg:pr-8 xl:pr-12">
            <Link
              href="/"
              aria-label="USAPEEK, inicio"
              className="inline-flex min-h-11 items-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <LogoWordmark width={160} aria-hidden="true" className="h-auto" />
            </Link>
            <p className="mt-3 max-w-64 text-sm leading-6 text-muted-foreground">
              Una vidriera serena para elegir con criterio.
            </p>
          </div>

          <nav
            aria-label="Navegación del pie"
            className="grid min-w-0 grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 sm:gap-x-8 lg:gap-x-6 xl:gap-x-10"
          >
            <div className="min-w-0">
              <h2 className="text-sm font-semibold leading-6">Explorar</h2>
              <ul className="mt-3">
                <li>
                  <FooterLink href="/search">Todo el catálogo</FooterLink>
                </li>
              </ul>
            </div>
            {FOOTER_LINK_GROUPS.map((group) => (
              <div key={group.title} className="min-w-0">
                <h2 className="text-sm font-semibold leading-6">{group.title}</h2>
                <ul className="mt-3">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <FooterLink href={link.href}>{link.label}</FooterLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-5 border-t border-border py-6 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
          <div>
            <h2 className="text-sm font-semibold">Sigue tu pedido</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Consulta el estado y el seguimiento de tu compra.
            </p>
          </div>
          <Button asChild className="h-11 w-full sm:w-auto">
            <Link href="/orders/track">
              Seguir mi pedido
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </Button>
        </div>

        <div className="flex flex-col gap-2 border-t border-border py-4 text-xs leading-5 text-muted-foreground md:flex-row md:items-center md:justify-between md:gap-6">
          <p>© {new Date().getFullYear()} usapeek</p>
          <nav aria-label="Información legal y privacidad">
            <ul className="flex flex-wrap gap-x-6">
              <li>
                <Link
                  href="/terms"
                  className="inline-flex min-h-11 items-center rounded-sm underline-offset-4 outline-none hover:text-brand-accent-text hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  Términos y condiciones
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy"
                  className="inline-flex min-h-11 items-center rounded-sm underline-offset-4 outline-none hover:text-brand-accent-text hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  Política de privacidad
                </Link>
              </li>
              <li>
                <CookiePreferencesButton />
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  )
}
