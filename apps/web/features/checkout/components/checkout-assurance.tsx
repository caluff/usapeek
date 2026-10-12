import { CreditCard, Info, Truck } from "lucide-react"

export function CheckoutAssurance() {
  return (
    <div className="mt-5 space-y-5 text-sm">
      <p className="flex items-start gap-2 bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        Los importes se calculan según tu dirección y el envío seleccionado.
      </p>
      <div className="space-y-5 border-t border-border pt-5">
        <div className="flex items-start gap-3">
          <CreditCard
            aria-hidden="true"
            className="mt-0.5 size-5 shrink-0 text-muted-foreground"
          />
          <div>
            <p className="font-medium">Métodos de pago</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Elige entre las opciones disponibles en el formulario de Stripe.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 border-t border-border pt-5">
          <Truck
            aria-hidden="true"
            className="mt-0.5 size-5 shrink-0 text-muted-foreground"
          />
          <div>
            <p className="font-medium">Entrega en Estados Unidos</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              En la dirección y con el método de envío que elegiste.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
