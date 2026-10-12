"use client"

import type { HttpTypes } from "@medusajs/types"
import { useActionState, useState } from "react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { updateProfileAction } from "@/features/account/actions"
import {
  AccountSubmitButton,
  FormStatus,
} from "@/features/account/components/form-status"
import { UsPhoneInput } from "@/features/account/components/us-phone-input"
import { INITIAL_ACCOUNT_STATE } from "@/features/account/types"

export function ProfileForm({
  customer,
}: {
  customer: HttpTypes.StoreCustomer
}) {
  const [state, action, pending] = useActionState(
    updateProfileAction,
    INITIAL_ACCOUNT_STATE,
  )
  const [values, setValues] = useState({
    first_name: customer.first_name ?? "",
    last_name: customer.last_name ?? "",
    phone: customer.phone ?? "",
  })

  return (
    <Card className="max-w-3xl">
      <CardHeader className="px-5 pt-5 sm:px-8 sm:pt-8">
        <CardTitle className="text-lg font-semibold">
          Datos personales
        </CardTitle>
        <CardDescription>
          Mantén tus datos actualizados para que podamos contactarte.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5 pb-5 sm:px-8 sm:pb-8">
        <form
          action={action}
          className="space-y-6"
          aria-label="Editar información de la cuenta"
          aria-busy={pending}
        >
          <FieldSet disabled={pending}>
            <FieldGroup className="grid gap-6 sm:grid-cols-2">
              <Field data-invalid={Boolean(state.fieldErrors?.first_name)}>
                <FieldLabel htmlFor="profile-first-name">Nombre</FieldLabel>
                <Input
                  id="profile-first-name"
                  name="first_name"
                  autoComplete="given-name"
                  required
                  maxLength={100}
                  value={values.first_name}
                  onChange={(event) =>
                    setValues({ ...values, first_name: event.target.value })
                  }
                  aria-invalid={Boolean(state.fieldErrors?.first_name)}
                  aria-describedby={
                    state.fieldErrors?.first_name
                      ? "profile-first-name-error"
                      : undefined
                  }
                />
                <FieldError id="profile-first-name-error">
                  {state.fieldErrors?.first_name}
                </FieldError>
              </Field>
              <Field data-invalid={Boolean(state.fieldErrors?.last_name)}>
                <FieldLabel htmlFor="profile-last-name">Apellido</FieldLabel>
                <Input
                  id="profile-last-name"
                  name="last_name"
                  autoComplete="family-name"
                  required
                  maxLength={100}
                  value={values.last_name}
                  onChange={(event) =>
                    setValues({ ...values, last_name: event.target.value })
                  }
                  aria-invalid={Boolean(state.fieldErrors?.last_name)}
                  aria-describedby={
                    state.fieldErrors?.last_name
                      ? "profile-last-name-error"
                      : undefined
                  }
                />
                <FieldError id="profile-last-name-error">
                  {state.fieldErrors?.last_name}
                </FieldError>
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="profile-email">
                  Correo electrónico
                </FieldLabel>
                <Input
                  id="profile-email"
                  type="email"
                  autoComplete="email"
                  value={customer.email}
                  readOnly
                  className="bg-muted/50 text-muted-foreground"
                  aria-describedby="profile-email-description"
                />
                <FieldDescription id="profile-email-description">
                  Es el correo que utilizas para iniciar sesión. No se puede
                  cambiar desde aquí.
                </FieldDescription>
              </Field>
              <Field
                className="sm:col-span-2"
                data-invalid={Boolean(state.fieldErrors?.phone)}
              >
                <FieldLabel htmlFor="profile-phone">
                  Teléfono{" "}
                  <span className="font-normal text-muted-foreground">
                    (opcional)
                  </span>
                </FieldLabel>
                <UsPhoneInput
                  id="profile-phone"
                  value={values.phone}
                  onChange={(phone) => setValues({ ...values, phone })}
                  error={state.fieldErrors?.phone}
                  describedBy="profile-phone-description"
                />
                <FieldDescription id="profile-phone-description">
                  Solo Estados Unidos (+1). Se completará al crear una dirección
                  nueva y podrás editarlo para cada dirección.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </FieldSet>
          <FormStatus state={state} />
          <div className="flex justify-end border-t border-border pt-6">
            <AccountSubmitButton pending={pending}>
              Guardar cambios
            </AccountSubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
