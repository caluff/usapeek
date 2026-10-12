import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { CustomerLoginForm } from "@/components/auth/auth-forms"
import { AuthShell } from "@/components/auth/auth-shell"
import { GoogleLogin } from "@/components/auth/google-login"
import { getCurrentCustomer, getMfaSecret } from "@/lib/auth-sdk"
import { safeRedirectPath } from "@/lib/auth-utils"
import {
  googleCallbackUrl,
  googleFeedback,
  googleNextPath,
} from "@/lib/google-auth"

export const metadata: Metadata = {
  title: "Iniciar sesión",
  description:
    "Accede a tu cuenta de USAPEEK para consultar tus pedidos, guardar favoritos y gestionar tus datos y direcciones.",
  robots: { index: false, follow: false },
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string; google?: string }>
}) {
  const params = await searchParams
  const mfa = params.google === "mfa_required" ? await getMfaSecret() : null
  const next = safeRedirectPath(params.next, "/account")
  if (mfa)
    return (
      <AuthShell
        variant="compact"
        eyebrow="Acceso"
        title="Verifica tu acceso"
        description="Ingresa el código de tu segundo factor para continuar."
      >
        <CustomerLoginForm
          next={next}
          initialState={{ status: "mfa_required", mfaMethods: mfa.methods }}
        />
      </AuthShell>
    )
  if (await getCurrentCustomer())
    redirect(safeRedirectPath(params.next, "/account"))
  const isLinkingGoogle = params.google === "link_required"
  const feedback =
    params.reason === "session_unavailable"
      ? "No pudimos completar el acceso. Tu carrito se conserva. Vuelve a intentarlo."
      : isLinkingGoogle
        ? undefined
        : googleFeedback(params.google)
  return (
    <AuthShell
      variant="compact"
      eyebrow="Acceso"
      title={
        isLinkingGoogle
          ? "Vincula Google a tu cuenta"
          : "Inicia sesión en tu cuenta"
      }
      description={
        isLinkingGoogle
          ? "Ya existe una cuenta con ese correo. Confirma tu correo y contraseña actuales una sola vez para vincular Google y conservar tus datos."
          : "Ingresa tu correo para acceder a tu cuenta."
      }
    >
      <div className="space-y-5">
        {feedback ? (
          <p role="status" className="text-sm text-muted-foreground">
            {feedback}
          </p>
        ) : null}
        <CustomerLoginForm
          next={next}
          expired={params.reason === "expired"}
          isLinkingGoogle={isLinkingGoogle}
          alternativeLogin={
            !isLinkingGoogle &&
            googleCallbackUrl(process.env.NEXT_PUBLIC_GOOGLE_CALLBACK_URL) ? (
              <>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span className="h-px flex-1 bg-border" aria-hidden="true" />O
                  continúa con
                  <span className="h-px flex-1 bg-border" aria-hidden="true" />
                </div>
                <GoogleLogin next={googleNextPath(next)} />
              </>
            ) : null
          }
        />
      </div>
    </AuthShell>
  )
}
