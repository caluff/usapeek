import type { Metadata } from "next"
import { PaymentReturn } from "@/features/checkout/components/payment-return"

export const metadata: Metadata = {
  title: "Estado de tu compra",
  description:
    "Consulta el resultado del proceso de pago y el estado de tu compra en USAPEEK antes de continuar al detalle del pedido.",
}

export default function CheckoutReturnPage() {
  return (
    <>
      <h1 className="text-3xl font-medium tracking-tight sm:text-5xl">
        Estado de tu compra
      </h1>
      <PaymentReturn />
    </>
  )
}
