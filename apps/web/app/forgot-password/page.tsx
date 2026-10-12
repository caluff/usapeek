import type { Metadata } from "next"
import { CustomerForgotPasswordForm } from "@/components/auth/auth-forms"
import { AuthShell } from "@/components/auth/auth-shell"

export const metadata: Metadata = {
  title: "Recuperar contraseña",
  description:
    "Solicita un enlace de recuperación por correo electrónico para restablecer la contraseña de tu cuenta de USAPEEK.",
  robots: { index: false, follow: false },
}
export default function ForgotPasswordPage() {
  return <AuthShell eyebrow="Recuperación" title="Recupera tu acceso" description="Te enviaremos instrucciones si encontramos una cuenta asociada al correo."><CustomerForgotPasswordForm /></AuthShell>
}
