import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { AuthShell } from "@/components/auth/auth-shell"
import { GoogleLogin } from "@/components/auth/google-login"
import { getCurrentCustomer } from "@/lib/auth-sdk"
import { googleCallbackUrl, googleNextPath } from "@/lib/google-auth"

export const metadata: Metadata = {
  title: "Vincular Google",
  description:
    "Confirma el acceso a tu cuenta de USAPEEK para vincularla con Google y utilizar ese método de inicio de sesión.",
  robots: { index: false, follow: false },
}

export default async function LinkGooglePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const next = googleNextPath((await searchParams).next)
  if (!(await getCurrentCustomer()))
    redirect(
      `/login?google=link_required&next=${encodeURIComponent(`/auth/google/link?next=${encodeURIComponent(next)}`)}`,
    )
  return (
    <AuthShell
      eyebrow="Cuenta"
      title="Vincular Google"
      description="Elige la cuenta de Google con el mismo correo de tu cuenta actual. Conservarás tus datos y podrás usar ambos métodos de acceso."
    >
      {googleCallbackUrl(process.env.NEXT_PUBLIC_GOOGLE_CALLBACK_URL) ? (
        <GoogleLogin next={next} link />
      ) : (
        <p role="alert">El acceso con Google no está disponible.</p>
      )}
    </AuthShell>
  )
}
