import type {
  ApplicationOptionsResponse,
  DraftData,
  SaveApplicationBody,
  WizardStep,
} from "@usapeek/vendor-onboarding-contracts"
import type { HttpTypes } from "@medusajs/types"
import { normalizeUsState } from "@usapeek/ui/us-states"
import { normalizeUsPhone } from "../account/validation"
import { US_STATES } from "../account/us-states"

export const STEPS: WizardStep[] = [
  "responsible",
  "store",
  "activity",
  "review",
]
export const STEP_LABELS: Record<WizardStep, string> = {
  responsible: "Responsable",
  store: "Tu tienda",
  activity: "Actividad",
  review: "Revisión",
}

export function initialDraft(
  customer: Pick<HttpTypes.StoreCustomer, "first_name" | "last_name" | "phone">,
  options: ApplicationOptionsResponse,
): DraftData {
  return {
    responsible: {
      first_name: customer.first_name ?? "",
      last_name: customer.last_name ?? "",
      phone: customer.phone ?? "",
    },
    store: { name: "", handle: "", description: "", website_url: "" },
    activity: {
      business_type: "individual",
      company_name: "",
      currency_code:
        options.currency_codes.length === 1 ? options.currency_codes[0] : "",
      category_ids: [],
      category_suggestion: "",
      description: "",
      business_address: {
        address_1: "",
        address_2: "",
        city: "",
        province: "",
        postal_code: "",
        country_code: options.country_codes.includes("us") ? "us" : "",
      },
    },
  }
}

export function copyBusinessAddress(
  address: Pick<
    HttpTypes.StoreCustomerAddress,
    | "address_1"
    | "address_2"
    | "city"
    | "province"
    | "postal_code"
    | "country_code"
  >,
): DraftData["activity"]["business_address"] {
  return {
    address_1: address.address_1 ?? "",
    address_2: address.address_2 ?? "",
    city: address.city ?? "",
    province: normalizeUsState(address.province ?? ""),
    postal_code: address.postal_code ?? "",
    country_code: address.country_code?.toLowerCase() ?? "",
  }
}

export function validMutation(body: {
  mutation_id: string
  expected_version: number
}) {
  return (
    Number.isSafeInteger(body.expected_version) &&
    body.expected_version >= 0 &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      body.mutation_id,
    )
  )
}

export function validateStep(
  data: DraftData,
  step: WizardStep,
  options: ApplicationOptionsResponse,
  categoryIds: string[],
): Record<string, string> {
  const errors: Record<string, string> = {}
  const required = (key: string, value: string, max: number) => {
    if (!value.trim() || value.trim().length > max)
      errors[key] = `Completa este campo (máximo ${max} caracteres).`
  }
  if (step === "responsible" || step === "review") {
    required("responsible.first_name", data.responsible.first_name, 100)
    required("responsible.last_name", data.responsible.last_name, 100)
    if (!normalizeUsPhone(data.responsible.phone))
      errors["responsible.phone"] =
        "Ingresa un teléfono válido de Estados Unidos (+1)."
  }
  if (step === "store" || step === "review") {
    required("store.name", data.store.name, 120)
    required("store.description", data.store.description, 2000)
    if (data.store.description.trim().length < 20)
      errors["store.description"] =
        "Cuéntanos sobre tu tienda en al menos 20 caracteres."
    if (data.store.website_url) {
      try {
        const url = new URL(data.store.website_url)
        if (
          !["http:", "https:"].includes(url.protocol) ||
          url.username ||
          url.password
        )
          throw new Error()
      } catch {
        errors["store.website_url"] =
          "Ingresa una URL http o https sin credenciales."
      }
    }
  }
  if (step === "activity" || step === "review") {
    if (data.activity.business_type === "company")
      required("activity.company_name", data.activity.company_name, 200)
    const address = data.activity.business_address
    required("activity.business_address.address_1", address.address_1, 200)
    required("activity.business_address.city", address.city, 100)
    if (
      address.country_code !== "us" ||
      !options.country_codes.includes(address.country_code)
    )
      errors["activity.business_address.country_code"] =
        "Selecciona un país habilitado. Este formulario admite Estados Unidos."
    if (
      !US_STATES.some((state) => state.value === address.province.toLowerCase())
    )
      errors["activity.business_address.province"] = "Selecciona un estado."
    if (!/^\d{5}(-\d{4})?$/.test(address.postal_code))
      errors["activity.business_address.postal_code"] =
        "Ingresa un ZIP de 5 dígitos o ZIP+4."
    if (!options.currency_codes.includes(data.activity.currency_code))
      errors["activity.currency_code"] = "Selecciona una moneda habilitada."
    const categorySuggestion = data.activity.category_suggestion?.trim() ?? ""
    if (categorySuggestion.length > 120 || /[\r\n]/.test(categorySuggestion))
      errors["activity.category_suggestion"] =
        "Escribe una categoría en una sola línea de hasta 120 caracteres."
    if (
      (!data.activity.category_ids.length && !categorySuggestion) ||
      data.activity.category_ids.length > 10 ||
      data.activity.category_ids.some((id) => !categoryIds.includes(id))
    )
      errors["activity.category_ids"] =
        "Selecciona hasta 10 categorías disponibles o propón una categoría."
    required("activity.description", data.activity.description, 2000)
  }
  return errors
}

// Preserve the exact operation across an uncertain response; editing creates a new operation.
export function mutationForPayload(
  previous: { fingerprint: string; id: string } | null,
  payload:
    | Omit<SaveApplicationBody, "mutation_id">
    | { expected_version: number; accepted_terms: true },
  createId: () => string,
) {
  const fingerprint = JSON.stringify(payload)
  return previous?.fingerprint === fingerprint
    ? previous
    : { fingerprint, id: createId() }
}
