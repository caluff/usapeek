"use client"

import type { HttpTypes } from "@medusajs/types"
import { UsAddressFields } from "@usapeek/ui/us-address-fields"
import { normalizeUsState } from "@usapeek/ui/us-states"
import { useActionState, useId, useState } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DialogFooter } from "@/components/ui/dialog"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  createAddressAction,
  updateAddressAction,
} from "@/features/account/actions"
import {
  AccountSubmitButton,
  FormStatus,
} from "@/features/account/components/form-status"
import { UsPhoneInput } from "@/features/account/components/us-phone-input"
import {
  INITIAL_ACCOUNT_STATE,
  type AccountActionState,
} from "@/features/account/types"

export function AddressForm({
  customer,
  address,
  isFirstAddress,
  onSuccess,
  onCancel,
  onPendingChange,
}: {
  customer: HttpTypes.StoreCustomer
  address?: HttpTypes.StoreCustomerAddress
  isFirstAddress: boolean
  onSuccess: (state: AccountActionState) => void
  onCancel: () => void
  onPendingChange: (pending: boolean) => void
}) {
  const formId = useId()
  const [values, setValues] = useState<Record<string, string>>({
    address_name: address?.address_name ?? "",
    first_name: address
      ? (address.first_name ?? "")
      : (customer.first_name ?? ""),
    last_name: address ? (address.last_name ?? "") : (customer.last_name ?? ""),
    address_1: address?.address_1 ?? "",
    address_2: address?.address_2 ?? "",
    city: address?.city ?? "",
    province: normalizeUsState(address?.province ?? ""),
    postal_code: address?.postal_code ?? "",
    phone: address ? (address.phone ?? "") : (customer.phone ?? ""),
  })
  const [isDefault, setIsDefault] = useState(
    address?.is_default_shipping ?? isFirstAddress,
  )
  const mustStayDefault =
    Boolean(address?.is_default_shipping) || isFirstAddress
  const [state, action, pending] = useActionState(
    async (previous: AccountActionState, formData: FormData) => {
      onPendingChange(true)
      try {
        const result = await (
          address ? updateAddressAction : createAddressAction
        )(previous, formData)
        if (result.status === "success") onSuccess(result)
        return result
      } finally {
        onPendingChange(false)
      }
    },
    INITIAL_ACCOUNT_STATE,
  )

  function updateValue(name: string, value: string) {
    setValues((current) => ({ ...current, [name]: value }))
  }

  return (
    <form
      action={action}
      className="space-y-6"
      aria-label={address ? "Editar dirección" : "Agregar dirección"}
      aria-busy={pending}
    >
      {address ? <input type="hidden" name="id" value={address.id} /> : null}
      <input type="hidden" name="country_code" value="us" />
      {mustStayDefault ? (
        <input type="hidden" name="is_default_shipping" value="on" />
      ) : null}
      <FieldSet disabled={pending}>
        <FieldGroup className="grid gap-5 sm:grid-cols-2">
          <AddressTextField
            formId={formId}
            name="address_name"
            label="Nombre de la dirección"
            placeholder="Casa, trabajo…"
            value={values.address_name}
            onChange={updateValue}
            error={state.fieldErrors?.address_name}
            className="sm:col-span-2"
            autoComplete="off"
            maxLength={100}
          />
          <AddressTextField
            formId={formId}
            name="first_name"
            label="Nombre"
            value={values.first_name}
            onChange={updateValue}
            error={state.fieldErrors?.first_name}
            autoComplete="shipping given-name"
            maxLength={100}
          />
          <AddressTextField
            formId={formId}
            name="last_name"
            label="Apellido"
            value={values.last_name}
            onChange={updateValue}
            error={state.fieldErrors?.last_name}
            autoComplete="shipping family-name"
            maxLength={100}
          />
          <AddressTextField
            formId={formId}
            name="address_1"
            label="Dirección"
            placeholder="Calle y número"
            value={values.address_1}
            onChange={updateValue}
            error={state.fieldErrors?.address_1}
            className="sm:col-span-2"
            autoComplete="shipping address-line1"
          />
          <AddressTextField
            formId={formId}
            name="address_2"
            label="Apartamento, suite, etc."
            value={values.address_2}
            onChange={updateValue}
            error={state.fieldErrors?.address_2}
            className="sm:col-span-2"
            autoComplete="shipping address-line2"
            required={false}
          />
          <UsAddressFields
            idPrefix={formId}
            province={values.province}
            city={values.city}
            onChange={(address) =>
              setValues((current) => ({ ...current, ...address }))
            }
            disabled={pending}
            errors={state.fieldErrors}
          />
          <Field data-invalid={Boolean(state.fieldErrors?.postal_code)}>
            <FieldLabel htmlFor={`${formId}-postal-code`}>
              Código postal
            </FieldLabel>
            <Input
              id={`${formId}-postal-code`}
              name="postal_code"
              value={values.postal_code}
              onChange={(event) =>
                updateValue("postal_code", event.target.value)
              }
              required
              autoComplete="shipping postal-code"
              maxLength={10}
              pattern="[0-9]{5}(-[0-9]{4})?"
              title="Usa 5 dígitos o el formato ZIP+4: 12345-6789."
              placeholder="12345"
              aria-invalid={Boolean(state.fieldErrors?.postal_code)}
              aria-describedby={`${formId}-postal-code-description ${formId}-postal-code-error`}
            />
            <FieldDescription id={`${formId}-postal-code-description`}>
              5 dígitos o ZIP+4 (12345-6789).
            </FieldDescription>
            <FieldError id={`${formId}-postal-code-error`}>
              {state.fieldErrors?.postal_code}
            </FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${formId}-country`}>País</FieldLabel>
            <Input
              id={`${formId}-country`}
              value="Estados Unidos"
              readOnly
              className="bg-muted/50 text-muted-foreground"
              aria-describedby={`${formId}-country-description`}
            />
            <FieldDescription id={`${formId}-country-description`}>
              Por ahora, solo direcciones de EE. UU.
            </FieldDescription>
            <FieldError>{state.fieldErrors?.country_code}</FieldError>
          </Field>
          <Field
            className="sm:col-span-2"
            data-invalid={Boolean(state.fieldErrors?.phone)}
          >
            <FieldLabel htmlFor={`${formId}-phone`}>
              Teléfono de contacto
            </FieldLabel>
            <UsPhoneInput
              id={`${formId}-phone`}
              value={values.phone}
              onChange={(phone) => updateValue("phone", phone)}
              required
              error={state.fieldErrors?.phone}
              describedBy={`${formId}-phone-description`}
            />
            <FieldDescription id={`${formId}-phone-description`}>
              {address
                ? "Este teléfono se usa solo para esta dirección."
                : "Usamos el teléfono de tu cuenta como punto de partida. Puedes cambiarlo para esta dirección."}
            </FieldDescription>
          </Field>
          <Field
            orientation="horizontal"
            className="min-h-11 border-t border-border pt-5 sm:col-span-2"
          >
            <Checkbox
              id={`${formId}-default`}
              name={mustStayDefault ? undefined : "is_default_shipping"}
              checked={isDefault}
              onCheckedChange={(checked) => setIsDefault(checked === true)}
              disabled={mustStayDefault || pending}
              aria-describedby={`${formId}-default-description`}
            />
            <FieldContent>
              <FieldLabel
                htmlFor={`${formId}-default`}
                className="min-h-6 cursor-pointer"
              >
                Usar como dirección predeterminada
              </FieldLabel>
              <FieldDescription id={`${formId}-default-description`}>
                {address?.is_default_shipping
                  ? "Para cambiarla, marca otra dirección como predeterminada."
                  : isFirstAddress
                    ? "Tu primera dirección será la predeterminada."
                    : "Será tu primera opción para futuros envíos."}
              </FieldDescription>
            </FieldContent>
          </Field>
        </FieldGroup>
      </FieldSet>
      <FormStatus state={state} />
      <DialogFooter className="border-t border-border pt-5">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={pending}
          className="min-h-12"
        >
          Cancelar
        </Button>
        <AccountSubmitButton pending={pending}>
          {address ? "Guardar dirección" : "Agregar dirección"}
        </AccountSubmitButton>
      </DialogFooter>
    </form>
  )
}

function AddressTextField({
  formId,
  name,
  label,
  value,
  onChange,
  error,
  autoComplete,
  className,
  placeholder,
  required = true,
  maxLength = 200,
}: {
  formId: string
  name: string
  label: string
  value: string
  onChange: (name: string, value: string) => void
  error?: string
  autoComplete: string
  className?: string
  placeholder?: string
  required?: boolean
  maxLength?: number
}) {
  const id = `${formId}-${name}`

  return (
    <Field className={className} data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>
        {label}
        {!required ? (
          <span className="font-normal text-muted-foreground">(opcional)</span>
        ) : null}
      </FieldLabel>
      <Input
        id={id}
        name={name}
        value={value}
        onChange={(event) => onChange(name, event.target.value)}
        required={required}
        maxLength={maxLength}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </Field>
  )
}
