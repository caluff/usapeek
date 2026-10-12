import Image from "next/image"
import { getPaymentProviders } from "@/features/cart/data"
import { cn } from "@/lib/utils"

export async function ProductPaymentMethods({
  regionId,
}: {
  regionId: string
}) {
  let supportsCards = false
  let hasError = false
  try {
    const providers = await getPaymentProviders(regionId)
    supportsCards =
      Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) &&
      providers.some((provider) => provider.id.startsWith("pp_stripe_"))
  } catch {
    hasError = true
  }

  return (
    <section
      className="mt-5 border-t border-border pt-5 text-xs"
      aria-label="Medios de pago"
    >
      <p className="font-semibold">
        {supportsCards ? "Se aceptan:" : "Medios de pago"}
      </p>
      {supportsCards ? (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {[
              ["visa", "Visa"],
              ["mastercard", "Mastercard"],
              ["amex", "American Express"],
              ["discover", "Discover"],
            ].map(([icon, name]) => (
              <Image
                key={icon}
                src={`/payment-methods/${icon}.svg`}
                alt={name}
                title={name}
                width={47}
                height={30}
                className={cn(
                  "h-[30px] w-[47px] object-contain",
                  icon === "visa" && "p-[5px]",
                )}
                unoptimized
              />
            ))}
          </div>
        </>
      ) : (
        <p className="mt-2 leading-5 text-muted-foreground" role="status">
          {hasError
            ? "No pudimos consultar los medios de pago."
            : "No hay medios de pago disponibles en este momento."}
        </p>
      )}
    </section>
  )
}
