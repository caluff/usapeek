import type { Metadata } from "next"

import { AccountHeading } from "@/features/account/components/account-heading"
import { TrackingAccountLinkContent } from "@/features/order-tracking/account-link-content"

export const metadata: Metadata = {
  title: "Añadir pedido a mi cuenta",
  description:
    "Asocia un pedido realizado como invitado a tu cuenta de USAPEEK para consultarlo junto con tus otras compras.",
}

export default function ClaimOrderPage() {
  return (
    <>
      <AccountHeading title="Añadir pedido a mi cuenta" />
      <TrackingAccountLinkContent />
    </>
  )
}
