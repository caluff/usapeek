"use client"

import type { HttpTypes } from "@medusajs/types"
import { UsAddressFields } from "@usapeek/ui/us-address-fields"
import { normalizeUsState } from "@usapeek/ui/us-states"
import { MapPin, Phone } from "lucide-react"
import { useRouter } from "next/navigation"
import { useActionState, useId, useState } from "react"

import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { UsPhoneInput } from "@/features/account/components/us-phone-input"
import {
  checkoutAddressValues,
  matchesCheckoutAddress,
} from "@/features/cart/checkout-address"
import {
  saveAddressAction,
  type CartActionState,
} from "@/features/cart/actions"

export function AddressStep({
  cart,
  customer,
  addresses,
}: {
  cart: HttpTypes.StoreCart
  customer: HttpTypes.StoreCustomer | null
  addresses: HttpTypes.StoreCustomerAddress[]
}) {
  const id = useId()
  const router = useRouter()
  const address = cart.shipping_address
  const availableAddresses = addresses.filter(
    (entry) => entry.country_code?.toLowerCase() === "us",
  )
  const [selectedId, setSelectedId] = useState(
    () =>
      availableAddresses.find(
        (entry) =>
          address &&
          matchesCheckoutAddress(entry, checkoutAddressValues(address)),
      )?.id ??
      availableAddresses.find((entry) => entry.is_default_shipping)?.id ??
      availableAddresses[0]?.id ??
      "",
  )
  const [isAddingAddress, setIsAddingAddress] = useState(!customer)
  const [values, setValues] = useState<Record<string, string>>({
    email: cart.email ?? customer?.email ?? "",
    first_name: customer?.first_name ?? address?.first_name ?? "",
    last_name: customer?.last_name ?? address?.last_name ?? "",
    address_1: customer ? "" : (address?.address_1 ?? ""),
    address_2: customer ? "" : (address?.address_2 ?? ""),
    city: customer ? "" : (address?.city ?? ""),
    province: customer ? "" : normalizeUsState(address?.province ?? ""),
    postal_code: customer ? "" : (address?.postal_code ?? ""),
    phone: customer?.phone ?? address?.phone ?? "",
  })
  const [state, action, pending] = useActionState(
    async (previous: CartActionState, formData: FormData) => {
      try {
        const result = await saveAddressAction(previous, formData)
        if (!result.error) {
          router.replace("/checkout?step=shipping")
        }
        return result
      } catch {
        return {
          error: "No pudimos guardar la dirección. Inténtalo nuevamente.",
        }
      }
    },
    {},
  )

  function updateValue(name: string, value: string) {
    setValues((current) =>
      current[name] === value ? current : { ...current, [name]: value },
    )
  }

  const fields = [
    {
      name: "first_name",
      label: "Nombre",
      autoComplete: "shipping given-name",
    },
    {
      name: "last_name",
      label: "Apellido",
      autoComplete: "shipping family-name",
    },
    {
      name: "address_1",
      label: "Dirección",
      autoComplete: "shipping address-line1",
      wide: true,
    },
    {
      name: "address_2",
      label: "Apartamento, suite, etc. (opcional)",
      autoComplete: "shipping address-line2",
      wide: true,
    },
  ]

  return (
    <form
      action={action}
      className="space-y-6"
      aria-busy={pending}
      aria-label="Contacto y dirección"
    >
      <input type="hidden" name="country_code" value="us" />
      {customer ? (
        <input type="hidden" name="customer_id" value={customer.id} />
      ) : null}
      <Field>
        <FieldLabel htmlFor={`${id}-email`}>Correo electrónico</FieldLabel>
        <Input
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={(event) => updateValue("email", event.currentTarget.value)}
          required
          maxLength={254}
          disabled={pending}
          className="min-h-12"
        />
      </Field>
      {customer ? (
        <fieldset disabled={pending} className="space-y-3">
          <legend className="mb-3 text-sm font-semibold">
            Dirección de envío
          </legend>
          {!availableAddresses.length ? (
            <p className="text-sm text-muted-foreground">
              No tienes direcciones guardadas en Estados Unidos.
            </p>
          ) : null}
          {availableAddresses.map((saved) => (
            <label
              key={saved.id}
              className="group flex cursor-pointer items-start gap-3 border border-border p-4 transition-colors hover:bg-muted/20 has-checked:border-brand-accent has-checked:bg-brand-accent/5 has-focus-visible:ring-2 has-focus-visible:ring-ring sm:gap-4 sm:p-5 has-disabled:cursor-not-allowed has-disabled:opacity-60"
            >
              <input
                type="radio"
                name="address_id"
                value={saved.id}
                required
                checked={!isAddingAddress && selectedId === saved.id}
                onChange={() => {
                  setSelectedId(saved.id)
                  setIsAddingAddress(false)
                }}
                className="mt-1 size-4 shrink-0 accent-brand-accent"
              />
              <span className="min-w-0 flex-1 text-sm">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">
                    {saved.address_name || "Dirección guardada"}
                  </span>
                  {saved.is_default_shipping ? (
                    <span className="border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground">
                      Predeterminada
                    </span>
                  ) : null}
                </span>
                <span className="mt-3 block font-medium">
                  {saved.first_name} {saved.last_name}
                </span>
                <span className="mt-2 flex items-start gap-2 leading-relaxed text-muted-foreground">
                  <MapPin
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0"
                  />
                  <span>
                    {saved.address_1}
                    {saved.address_2 ? `, ${saved.address_2}` : ""}
                    {" · "}
                    {saved.city}, {saved.province?.toUpperCase()}{" "}
                    {saved.postal_code} · Estados Unidos
                  </span>
                </span>
                <span className="mt-2 flex items-center gap-2 text-muted-foreground">
                  <Phone aria-hidden="true" className="size-4 shrink-0" />
                  {saved.phone}
                </span>
              </span>
            </label>
          ))}
          <label className="flex min-h-16 cursor-pointer items-center gap-3 border border-dashed border-border p-4 transition-colors has-checked:border-foreground has-checked:bg-muted/40 has-disabled:cursor-not-allowed has-disabled:opacity-60">
            <input
              type="radio"
              name="address_id"
              value=""
              required
              checked={isAddingAddress}
              onChange={() => setIsAddingAddress(true)}
              aria-controls={`${id}-new-address`}
              className="size-4 shrink-0 accent-brand-accent"
            />
            <span className="text-sm font-semibold">
              Añadir nueva ubicación
            </span>
          </label>
        </fieldset>
      ) : null}
      {isAddingAddress ? (
        <fieldset
          id={`${id}-new-address`}
          disabled={pending}
          className="grid min-w-0 gap-5 sm:grid-cols-2"
        >
          <legend className="sr-only">
            Dirección de envío en Estados Unidos
          </legend>
          {fields.map((field) => (
            <Field
              key={field.name}
              className={field.wide ? "sm:col-span-2" : undefined}
            >
              <FieldLabel htmlFor={`${id}-${field.name}`}>
                {field.label}
              </FieldLabel>
              <Input
                id={`${id}-${field.name}`}
                name={field.name}
                type="text"
                value={values[field.name]}
                onChange={(event) =>
                  updateValue(field.name, event.currentTarget.value)
                }
                autoComplete={field.autoComplete}
                required={field.name !== "address_2"}
                maxLength={200}
                className="min-h-12"
              />
            </Field>
          ))}
          <UsAddressFields
            showAttribution={false}
            idPrefix={id}
            province={values.province}
            city={values.city}
            onChange={(address) =>
              setValues((current) => ({ ...current, ...address }))
            }
            disabled={pending}
          />
          <Field>
            <FieldLabel htmlFor={`${id}-postal_code`}>Código postal</FieldLabel>
            <Input
              id={`${id}-postal_code`}
              name="postal_code"
              value={values.postal_code}
              onChange={(event) =>
                updateValue("postal_code", event.currentTarget.value)
              }
              required
              autoComplete="shipping postal-code"
              maxLength={10}
              pattern="[0-9]{5}(-[0-9]{4})?"
              title="Usa 5 dígitos o ZIP+4: 12345-6789."
              className="min-h-12"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-country`}>País</FieldLabel>
            <Input
              id={`${id}-country`}
              value="Estados Unidos"
              readOnly
              className="min-h-12 bg-muted/40"
            />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor={`${id}-phone`}>
              Teléfono de contacto
            </FieldLabel>
            <UsPhoneInput
              id={`${id}-phone`}
              value={values.phone}
              onChange={(phone) => updateValue("phone", phone)}
              required
              disabled={pending}
            />
          </Field>
        </fieldset>
      ) : null}
      {customer && isAddingAddress ? (
        <p className="text-sm text-muted-foreground">
          Esta dirección también se guardará en tu perfil.
        </p>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Usaremos esta misma dirección para la facturación.
      </p>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button
        type="submit"
        size="lg"
        disabled={pending || (!isAddingAddress && !selectedId)}
        className="w-full sm:w-auto"
      >
        {pending ? "Guardando…" : "Continuar al envío"}
      </Button>
    </form>
  )
}
