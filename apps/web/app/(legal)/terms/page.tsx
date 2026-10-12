import type { Metadata } from "next"
import { LegalDocument } from "../_components/legal-document"
import { TERMS_SECTIONS } from "../_content/terms"

export const metadata: Metadata = {
  title: "Términos y condiciones",
  description: "Borrador en revisión de los términos y condiciones de usapeek.",
}

export default function TermsPage() {
  return (
    <LegalDocument
      title="Términos y condiciones"
      sections={TERMS_SECTIONS}
      relatedDocument={{
        href: "/privacy",
        label: "Leer la política de privacidad",
      }}
    />
  )
}
