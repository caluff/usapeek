import type { Metadata } from "next"
import { LegalDocument } from "../_components/legal-document"
import { PRIVACY_SECTIONS } from "../_content/privacy"

export const metadata: Metadata = {
  title: "Política de privacidad",
  description: "Borrador en revisión de la política de privacidad de usapeek.",
}

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Política de privacidad"
      sections={PRIVACY_SECTIONS}
      relatedDocument={{
        href: "/terms",
        label: "Leer los términos y condiciones",
      }}
    />
  )
}
