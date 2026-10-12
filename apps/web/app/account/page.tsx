import type { Metadata } from "next"
import { AccountHeading } from "@/features/account/components/account-heading"
import { ProfileForm } from "@/features/account/components/profile-form"
import { getAccount } from "@/features/account/data"

export const metadata: Metadata = {
  title: "Mi perfil",
  description:
    "Consulta y actualiza los datos personales de tu cuenta de USAPEEK, como tu nombre, apellido y teléfono de contacto.",
}

export default async function AccountPage() {
  const { customer } = await getAccount()
  return (
    <>
      <AccountHeading
        title="Información de la cuenta"
        description="Mantén tus datos al día. Tu teléfono se usará para completar las nuevas direcciones."
      />
      <ProfileForm customer={customer} />
    </>
  )
}
