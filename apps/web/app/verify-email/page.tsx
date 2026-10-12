import type { Metadata } from "next"
import { CustomerVerifyEmailForm } from "@/components/auth/auth-forms"
import { AuthShell } from "@/components/auth/auth-shell"
import { getVerificationCode, getVerificationSecret } from "@/lib/auth-sdk"
import { safeRedirectPath } from "@/lib/auth-utils"
import { getApplication } from "@/features/vendor-onboarding/data"
import { VerificationPanel } from "@/features/vendor-onboarding/components/verification-panel"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Verificar correo",
  description:
    "Confirma tu correo electrónico para completar la verificación de tu cuenta y continuar en USAPEEK.",
  robots: { index: false, follow: false },
}
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const next = safeRedirectPath((await searchParams).next, "/account")
  if (next === "/account/sell" && !(await getVerificationSecret())) {
    const response = await getApplication()
    return (
      <AuthShell
        eyebrow="Verificación"
        title="Confirma tu correo"
        description="Verifica el correo de tu cuenta para continuar con tu solicitud de vendedor."
      >
        <VerificationPanel
          verified={response.applicant.email_verified}
          email={response.applicant.email}
          hasCode={Boolean(await getVerificationCode())}
          testMode={response.applicant.email_verification_test_mode}
        />
        <Button asChild variant="outline" className="mt-5 w-full">
          <Link href="/account/sell">Volver a mi solicitud</Link>
        </Button>
      </AuthShell>
    )
  }
  return (
    <AuthShell
      eyebrow="Verificación"
      title="Confirma tu correo"
      description="Usa el código enviado a tu dirección para activar el acceso."
    >
      <CustomerVerifyEmailForm
        hasCode={Boolean(await getVerificationCode())}
        next={next}
      />
    </AuthShell>
  )
}
