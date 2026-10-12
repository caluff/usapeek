import type { Metadata } from "next"
import { CustomerRegisterForm } from "@/components/auth/auth-forms"
import { AuthShell } from "@/components/auth/auth-shell"

export const metadata: Metadata = {
  title: "Crear cuenta",
  description:
    "Crea tu cuenta de USAPEEK para guardar favoritos, administrar tus direcciones y consultar tus pedidos en un solo lugar.",
  robots: { index: false, follow: false },
}
export default function RegisterPage() {
  return <AuthShell eyebrow="Registro" title="Crea tu cuenta" description="Guarda tus datos de cliente sin perder la posibilidad de navegar y comprar como invitado."><CustomerRegisterForm /></AuthShell>
}
