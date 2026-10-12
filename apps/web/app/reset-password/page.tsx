import type { Metadata } from "next"
import { CustomerResetPasswordForm } from "@/components/auth/auth-forms"
import { AuthShell } from "@/components/auth/auth-shell"
import { getResetSecret } from "@/lib/auth-sdk"

export const metadata: Metadata = {
  title: "Nueva contraseña",
  description:
    "Elige una nueva contraseña para tu cuenta de USAPEEK utilizando el enlace de recuperación que recibiste por correo.",
  robots: { index: false, follow: false },
}
export default async function ResetPasswordPage() {
  return <AuthShell eyebrow="Seguridad" title="Elige una nueva contraseña" description="El enlace es de un solo uso y vence por seguridad."><CustomerResetPasswordForm hasToken={Boolean(await getResetSecret())} /></AuthShell>
}
