import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"
import { Badge } from "@/components/ui/badge"

export type LegalSection = {
  id: string
  title: string
  content: ReactNode
}

type LegalDocumentProps = {
  title: string
  sections: readonly LegalSection[]
  relatedDocument: { href: string; label: string }
}

export function LegalDocument({
  title,
  sections,
  relatedDocument,
}: LegalDocumentProps) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-12 lg:py-16">
      <Link
        href="/"
        className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-4" strokeWidth={1.5} aria-hidden="true" />
        Volver a la tienda
      </Link>

      <header className="mt-6">
        <Badge variant="warning">Borrador en revisión</Badge>
        <h1 className="mt-4 text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
          {title}
        </h1>
        <aside
          aria-label="Estado del documento"
          className="mt-6 border-l-2 border-brand-accent bg-brand-accent/5 px-4 py-3 text-sm leading-6 text-muted-foreground"
        >
          Esta versión se publica para revisión y todavía no entra en vigor.
          Algunas funciones descritas siguen pendientes. Los apartados por
          completar se indican al final del documento.
        </aside>
      </header>

      <nav aria-label={`Contenido de ${title}`} className="mt-8">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          En este documento
        </p>
        <ul className="mt-2 flex flex-wrap gap-x-5">
          {sections.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="inline-flex min-h-11 items-center text-sm text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring"
              >
                {section.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <article className="mt-10 space-y-10 sm:mt-12 sm:space-y-12">
        {sections.map((section) => (
          <section
            key={section.id}
            id={section.id}
            aria-labelledby={`${section.id}-title`}
            className="scroll-mt-32"
          >
            <h2
              id={`${section.id}-title`}
              className="text-lg font-semibold text-[color-mix(in_oklch,var(--brand-accent)_30%,var(--foreground))]"
            >
              {section.title}
            </h2>
            <div className="mt-4 text-sm leading-7 sm:text-base [&_li+li]:mt-2 [&_p+p]:mt-4 [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-5">
              {section.content}
            </div>
          </section>
        ))}
      </article>

      <Link
        href={relatedDocument.href}
        className="mt-10 inline-flex min-h-11 items-center text-sm font-semibold text-brand-accent-text underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring sm:mt-12"
      >
        {relatedDocument.label}
      </Link>
    </main>
  )
}
