"use client"

import type {
  ApplicationOptionsResponse,
  DraftData,
  WizardStep,
} from "@usapeek/vendor-onboarding-contracts"
import type { HttpTypes } from "@medusajs/types"
import { UsAddressFields } from "@usapeek/ui/us-address-fields"
import { normalizeUsState } from "@usapeek/ui/us-states"
import type { ChangeEvent, ComponentProps } from "react"
import { useState } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { UsPhoneInput } from "@/features/account/components/us-phone-input"
import { copyBusinessAddress } from "../validation"

function TextField({
  label,
  error,
  multiline,
  ...props
}: Omit<ComponentProps<typeof Input>, "onChange"> & {
  label: string
  error?: string
  multiline?: boolean
  onChange?: (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void
}) {
  const shared = {
    id: props.id,
    value: props.value,
    maxLength: props.maxLength,
    required: props.required,
    "aria-invalid": Boolean(error),
    "aria-describedby": error ? `${props.id}-error` : undefined,
  }
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={props.id}>{label}</FieldLabel>
      {multiline ? (
        <Textarea {...shared} onChange={props.onChange} />
      ) : (
        <Input {...props} {...shared} />
      )}
      <FieldError id={`${props.id}-error`}>{error}</FieldError>
    </Field>
  )
}

export function ApplicationFields({
  step,
  draft,
  onChange,
  email,
  errors,
  options,
  categories,
  addresses,
}: {
  step: WizardStep
  draft: DraftData
  onChange: (data: DraftData) => void
  email: string
  errors: Record<string, string>
  options: ApplicationOptionsResponse
  categories: HttpTypes.StoreProductCategory[]
  addresses: HttpTypes.StoreCustomerAddress[]
}) {
  const [addressSelectionKey, setAddressSelectionKey] = useState(0)
  const responsible = (key: keyof DraftData["responsible"], value: string) =>
    onChange({ ...draft, responsible: { ...draft.responsible, [key]: value } })
  const store = (key: keyof DraftData["store"], value: string) =>
    onChange({ ...draft, store: { ...draft.store, [key]: value } })
  const activity = <K extends keyof DraftData["activity"]>(
    key: K,
    value: DraftData["activity"][K],
  ) => onChange({ ...draft, activity: { ...draft.activity, [key]: value } })
  const address = draft.activity.business_address
  const changeAddress = (key: keyof typeof address, value: string) =>
    activity("business_address", { ...address, [key]: value })

  if (step === "responsible")
    return (
      <FieldGroup>
        <div className="grid gap-6 sm:grid-cols-2">
          <TextField
            id="responsible.first_name"
            label="Nombre"
            autoComplete="given-name"
            value={draft.responsible.first_name}
            maxLength={100}
            onChange={(e) => responsible("first_name", e.target.value)}
            error={errors["responsible.first_name"]}
          />
          <TextField
            id="responsible.last_name"
            label="Apellido"
            autoComplete="family-name"
            value={draft.responsible.last_name}
            maxLength={100}
            onChange={(e) => responsible("last_name", e.target.value)}
            error={errors["responsible.last_name"]}
          />
        </div>
        <Field>
          <FieldLabel htmlFor="applicant-email">Correo de tu cuenta</FieldLabel>
          <Input
            id="applicant-email"
            type="email"
            value={email}
            readOnly
            aria-describedby="email-help"
          />
          <FieldDescription id="email-help">
            Usaremos este correo para tu solicitud y tu acceso como vendedor.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="responsible.phone">
            Teléfono de contacto
          </FieldLabel>
          <UsPhoneInput
            id="responsible.phone"
            value={draft.responsible.phone}
            onChange={(value) => responsible("phone", value)}
            error={errors["responsible.phone"]}
          />
          <FieldDescription>
            Estados Unidos (+1). Usamos el teléfono de tu cuenta como punto de
            partida.
          </FieldDescription>
        </Field>
      </FieldGroup>
    )

  if (step === "store")
    return (
      <FieldGroup>
        <TextField
          id="store.name"
          label="Nombre de la tienda"
          value={draft.store.name}
          maxLength={120}
          onChange={(e) => store("name", e.target.value)}
          error={errors["store.name"]}
        />
        <TextField
          id="store.description"
          label="Cuéntanos sobre tu tienda"
          multiline
          value={draft.store.description}
          maxLength={2000}
          onChange={(e) => store("description", e.target.value)}
          error={errors["store.description"]}
        />
        <TextField
          id="store.website_url"
          label="Sitio web (opcional)"
          type="url"
          placeholder="https://"
          value={draft.store.website_url}
          maxLength={2048}
          onChange={(e) => store("website_url", e.target.value)}
          error={errors["store.website_url"]}
        />
      </FieldGroup>
    )

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="business-type">Tipo de actividad</FieldLabel>
        <NativeSelect
          id="business-type"
          value={draft.activity.business_type}
          onChange={(e) =>
            onChange({
              ...draft,
              activity: {
                ...draft.activity,
                business_type:
                  e.target.value === "company" ? "company" : "individual",
                company_name:
                  e.target.value === "company"
                    ? draft.activity.company_name
                    : "",
              },
            })
          }
        >
          <NativeSelectOption value="individual">
            Persona individual
          </NativeSelectOption>
          <NativeSelectOption value="company">Empresa</NativeSelectOption>
        </NativeSelect>
      </Field>
      {draft.activity.business_type === "company" ? (
        <TextField
          id="activity.company_name"
          label="Nombre de la empresa"
          autoComplete="organization"
          value={draft.activity.company_name}
          maxLength={200}
          onChange={(e) => activity("company_name", e.target.value)}
          error={errors["activity.company_name"]}
        />
      ) : null}
      <div className="border-t border-border pt-6">
        <h3 className="text-lg font-medium">Dirección de la actividad</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Es independiente de tus direcciones de compra. No solicitamos datos
          fiscales, bancarios ni documentos.
        </p>
      </div>
      {addresses.some((item) => item.country_code?.toLowerCase() === "us") ? (
        <Field>
          <FieldLabel htmlFor="copy-address">
            Copiar una dirección de mi cuenta
          </FieldLabel>
          <NativeSelect
            id="copy-address"
            value=""
            onChange={(e) => {
              const selected = addresses.find(
                (item) => item.id === e.target.value,
              )
              if (selected) {
                activity("business_address", copyBusinessAddress(selected))
                setAddressSelectionKey((current) => current + 1)
              }
            }}
          >
            <NativeSelectOption value="">
              Seleccionar dirección (opcional)
            </NativeSelectOption>
            {addresses
              .filter((item) => item.country_code?.toLowerCase() === "us")
              .map((item) => (
                <NativeSelectOption key={item.id} value={item.id}>
                  {item.address_name || item.address_1} — {item.city}
                </NativeSelectOption>
              ))}
          </NativeSelect>
          <FieldDescription>
            Se copiará una vez; los cambios posteriores no modifican tu cuenta.
          </FieldDescription>
        </Field>
      ) : null}
      <TextField
        id="activity.business_address.address_1"
        label="Dirección"
        autoComplete="address-line1"
        value={address.address_1}
        maxLength={200}
        onChange={(e) => changeAddress("address_1", e.target.value)}
        error={errors["activity.business_address.address_1"]}
      />
      <TextField
        id="activity.business_address.address_2"
        label="Apartamento, unidad, etc. (opcional)"
        autoComplete="address-line2"
        value={address.address_2}
        maxLength={200}
        onChange={(e) => changeAddress("address_2", e.target.value)}
      />
      <div className="grid gap-6 sm:grid-cols-2">
        <UsAddressFields
          key={addressSelectionKey}
          idPrefix="activity.business_address"
          provinceName="activity.business_address.province"
          cityName="activity.business_address.city"
          province={normalizeUsState(address.province)}
          city={address.city}
          onChange={(location) =>
            activity("business_address", { ...address, ...location })
          }
          autoCompletePrefix=""
          errors={{
            province: errors["activity.business_address.province"],
            city: errors["activity.business_address.city"],
          }}
        />
        <TextField
          id="activity.business_address.postal_code"
          label="Código postal (ZIP)"
          autoComplete="postal-code"
          value={address.postal_code}
          maxLength={10}
          onChange={(e) => changeAddress("postal_code", e.target.value)}
          error={errors["activity.business_address.postal_code"]}
        />
        <Field>
          <FieldLabel htmlFor="country">País</FieldLabel>
          <NativeSelect
            id="country"
            value={address.country_code}
            aria-invalid={Boolean(
              errors["activity.business_address.country_code"],
            )}
            aria-describedby="country-error"
            onChange={(e) => changeAddress("country_code", e.target.value)}
          >
            <NativeSelectOption value="">Seleccionar país</NativeSelectOption>
            {options.country_codes
              .filter((code) => code === "us")
              .map((code) => (
                <NativeSelectOption key={code} value={code}>
                  Estados Unidos
                </NativeSelectOption>
              ))}
          </NativeSelect>
          <FieldError id="country-error">
            {errors["activity.business_address.country_code"]}
          </FieldError>
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor="currency">Moneda de la tienda</FieldLabel>
        <NativeSelect
          id="currency"
          value={draft.activity.currency_code}
          aria-invalid={Boolean(errors["activity.currency_code"])}
          aria-describedby="currency-error"
          onChange={(e) => activity("currency_code", e.target.value)}
        >
          <NativeSelectOption value="">Seleccionar moneda</NativeSelectOption>
          {options.currency_codes.map((code) => (
            <NativeSelectOption key={code} value={code}>
              {code.toUpperCase()}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <FieldError id="currency-error">
          {errors["activity.currency_code"]}
        </FieldError>
      </Field>
      <Field aria-labelledby="application-categories-label">
        <FieldLabel id="application-categories-label">
          Categorías de tus productos
        </FieldLabel>
        <FieldDescription>
          Selecciona hasta 10 categorías o propón una si no encuentras la tuya.
        </FieldDescription>
        <div className="grid max-h-64 gap-3 overflow-auto border border-border p-4 sm:grid-cols-2">
          {categories.length ? (
            categories.map((category) => (
              <Field key={category.id} orientation="horizontal">
                <Checkbox
                  id={`category-${category.id}`}
                  checked={draft.activity.category_ids.includes(category.id)}
                  disabled={
                    draft.activity.category_ids.length >= 10 &&
                    !draft.activity.category_ids.includes(category.id)
                  }
                  onCheckedChange={(checked) =>
                    activity(
                      "category_ids",
                      checked
                        ? [...draft.activity.category_ids, category.id]
                        : draft.activity.category_ids.filter(
                            (id) => id !== category.id,
                          ),
                    )
                  }
                />
                <FieldLabel
                  htmlFor={`category-${category.id}`}
                  className="font-normal"
                >
                  {category.name}
                </FieldLabel>
              </Field>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              Todavía no hay categorías disponibles. Puedes proponer una abajo y
              continuar con tu solicitud.
            </p>
          )}
        </div>
        <FieldError>{errors["activity.category_ids"]}</FieldError>
      </Field>
      <Field data-invalid={Boolean(errors["activity.category_suggestion"])}>
        <FieldLabel htmlFor="activity.category_suggestion">
          ¿No encuentras tu categoría? Propón una
        </FieldLabel>
        <Input
          id="activity.category_suggestion"
          value={draft.activity.category_suggestion ?? ""}
          maxLength={120}
          placeholder="Nombre de la categoría"
          onChange={(event) =>
            activity("category_suggestion", event.target.value)
          }
          aria-invalid={Boolean(errors["activity.category_suggestion"])}
          aria-describedby="category-suggestion-help category-suggestion-error"
        />
        <FieldDescription id="category-suggestion-help">
          El equipo recibirá tu propuesta y podrá añadirla al catálogo. No
          necesitas seleccionar una categoría existente para enviar tu
          solicitud.
        </FieldDescription>
        <FieldError id="category-suggestion-error">
          {errors["activity.category_suggestion"]}
        </FieldError>
      </Field>
      <TextField
        id="activity.description"
        label="¿Qué productos planeas ofrecer?"
        multiline
        value={draft.activity.description}
        maxLength={2000}
        onChange={(e) => activity("description", e.target.value)}
        error={errors["activity.description"]}
      />
    </FieldGroup>
  )
}
