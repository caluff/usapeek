import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { ShoppingBag } from "lucide-react"
import { SiteFooter } from "@/components/site-footer"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { getCartAvailability } from "@/features/cart/availability"
import { getCart } from "@/features/cart/data"
import { CartItem } from "@/features/cart/components/cart-item"
import { OrderSummary } from "@/features/cart/components/order-summary"

export const metadata: Metadata = {
  title: "Tu carrito",
  description:
    "Revisa los productos de tu carrito, ajusta las cantidades y consulta el resumen antes de continuar con tu compra en USAPEEK.",
  robots: { index: false, follow: false },
}
export const dynamic = "force-dynamic"

async function CartContent() {
  let cart
  try {
    cart = await getCart()
  } catch {
    return (
      <div role="alert" className="border border-border p-6">
        <p>No pudimos cargar tu carrito. Tus productos siguen guardados.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/cart">Reintentar</Link>
        </Button>
      </div>
    )
  }
  if (!cart?.items?.length)
    return (
      <div className="border border-border px-6 py-16 text-center">
        <ShoppingBag className="mx-auto size-10" aria-hidden="true" />
        <h2 className="mt-6 text-2xl">Tu carrito está vacío</h2>
        <Button asChild className="mt-6">
          <Link href="/search">Explorar el catálogo</Link>
        </Button>
      </div>
    )
  const itemCount = cart.items.reduce(
    (total, item) => total + item.quantity,
    0,
  )
  const offers = getCartAvailability(cart).catch(() => [])

  return (
    <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] xl:gap-14">
      <section aria-label="Productos en tu carrito">
        <p className="mb-5 font-sans text-sm text-muted-foreground">
          {itemCount} {itemCount === 1 ? "producto" : "productos"}
        </p>
        {cart.items.map((item) => (
          <CartItem
            key={item.id}
            item={item}
            currency={cart.currency_code}
            offers={offers}
          />
        ))}
      </section>
      <aside className="space-y-4 lg:sticky lg:top-28">
        <OrderSummary cart={cart} />
        <Button asChild className="min-h-12 w-full">
          <Link href="/checkout">Continuar con la compra</Link>
        </Button>
        <p className="font-sans text-xs leading-5 text-muted-foreground">
          Entrega en Estados Unidos · Precios en USD. El envío y los impuestos
          se confirman al finalizar la compra.
        </p>
      </aside>
    </div>
  )
}

export default function CartPage() {
  return (
    <>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-12 sm:px-6 lg:px-10">
        <Link
          href="/search"
          className="font-sans text-sm underline underline-offset-4"
        >
          Seguir comprando
        </Link>
        <h1 className="mt-6 mb-10 border-b border-foreground pb-6 text-4xl font-semibold tracking-tight sm:text-6xl">
          Tu carrito
        </h1>
        <Suspense
          fallback={
            <Skeleton
              className="h-80 w-full"
              aria-label="Cargando productos del carrito"
            />
          }
        >
          <CartContent />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  )
}
