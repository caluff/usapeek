import type {
  DraftData,
  WizardStep,
} from "@usapeek/vendor-onboarding-contracts"
import type { HttpTypes } from "@medusajs/types"
import { Button } from "@/components/ui/button"

export function ApplicationReview({
  data,
  email,
  categories,
  onEdit,
}: {
  data: DraftData
  email: string
  categories?: HttpTypes.StoreProductCategory[]
  onEdit?: (step: WizardStep) => void
}) {
  const address = data.activity.business_address
  const sections: { step: WizardStep; title: string; values: string[] }[] = [
    {
      step: "responsible",
      title: "Responsable",
      values: [
        `${data.responsible.first_name} ${data.responsible.last_name}`,
        email,
        data.responsible.phone,
      ],
    },
    {
      step: "store",
      title: "Tu tienda",
      values: [
        data.store.name,
        data.store.description,
        data.store.website_url,
      ],
    },
    {
      step: "activity",
      title: "Actividad",
      values: [
        data.activity.business_type === "company"
          ? `Empresa · ${data.activity.company_name}`
          : "Persona individual",
        address.address_1,
        address.address_2,
        `${address.city}, ${address.province.toUpperCase()} ${address.postal_code}`,
        address.country_code.toUpperCase(),
        data.activity.currency_code.toUpperCase(),
        categories
          ? data.activity.category_ids
              .map(
                (id) =>
                  categories.find((category) => category.id === id)?.name ??
                  "Categoría no disponible",
              )
              .join(", ")
          : `${data.activity.category_ids.length} categorías seleccionadas`,
        data.activity.category_suggestion?.trim()
          ? `Categoría propuesta: ${data.activity.category_suggestion.trim()} (pendiente de revisión)`
          : "",
        data.activity.description,
      ],
    },
  ]
  return (
    <div className="divide-y divide-border">
      {sections.map((section) => (
        <section key={section.step} className="py-5 first:pt-0 last:pb-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="font-semibold">{section.title}</h3>
            {onEdit ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => onEdit(section.step)}
              >
                Editar<span className="sr-only"> {section.title}</span>
              </Button>
            ) : null}
          </div>
          <div className="space-y-1 text-sm leading-6 text-muted-foreground">
            {section.values.filter(Boolean).map((value, index) => (
              <p key={index} className="whitespace-pre-wrap break-words">
                {value}
              </p>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
