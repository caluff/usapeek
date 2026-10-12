"use client";

import { useActionState, useId, useState } from "react";
import type { HttpTypes } from "@mercurjs/types";
import { UsAddressFields } from "@usapeek/ui/us-address-fields";
import { normalizeUsState } from "@usapeek/ui/us-states";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { notifyFeedback } from "@/lib/feedback";
import { updateAddressAction } from "./actions";
import type { MutationState } from "./presentation";

export function AddressForm({
  address,
}: {
  address: HttpTypes.VendorSellerResponse["seller"]["address"];
}) {
  const id = useId();
  const [values, setValues] = useState({
    company: address?.company ?? "",
    address_1: address?.address_1 ?? "",
    address_2: address?.address_2 ?? "",
    province: normalizeUsState(address?.province),
    city: address?.city ?? "",
    postal_code: address?.postal_code ?? "",
  });
  const [state, action, isPending] = useActionState(
    async (previous: MutationState, form: FormData) => {
      const result = await updateAddressAction(previous, form);
      notifyFeedback(result);
      return result;
    },
    { status: "idle" },
  );

  return (
    <form action={action} className="space-y-5" aria-busy={isPending}>
      <input type="hidden" name="country_code" value="us" />
      <fieldset disabled={isPending} className="grid gap-5 sm:grid-cols-2">
        {(
          [
            {
              name: "company",
              label: "Empresa",
              autoComplete: "organization",
              required: false,
            },
            {
              name: "address_1",
              label: "Dirección",
              autoComplete: "address-line1",
              required: true,
            },
            {
              name: "address_2",
              label: "Apartamento, suite o unidad (opcional)",
              autoComplete: "address-line2",
              required: false,
            },
          ] as const
        ).map((field) => (
          <Field
            key={field.name}
            className={field.name === "company" ? "sm:col-span-2" : undefined}
          >
            <FieldLabel htmlFor={`${id}-${field.name}`}>
              {field.label}
            </FieldLabel>
            <Input
              id={`${id}-${field.name}`}
              name={field.name}
              value={values[field.name]}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  [field.name]: event.target.value,
                }))
              }
              autoComplete={field.autoComplete}
              required={field.required}
              maxLength={200}
              className="h-11"
            />
          </Field>
        ))}
        <UsAddressFields
          idPrefix={id}
          province={values.province}
          city={values.city}
          onChange={(location) =>
            setValues((current) => ({ ...current, ...location }))
          }
          disabled={isPending}
          autoCompletePrefix=""
        />
        <Field>
          <FieldLabel htmlFor={`${id}-postal-code`}>Código postal</FieldLabel>
          <Input
            id={`${id}-postal-code`}
            name="postal_code"
            value={values.postal_code}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                postal_code: event.target.value,
              }))
            }
            autoComplete="postal-code"
            required
            maxLength={10}
            pattern="[0-9]{5}(-[0-9]{4})?"
            title="Usa 5 dígitos o ZIP+4: 12345-6789."
            className="h-11"
          />
        </Field>
      </fieldset>
      {state.message ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={
            state.status === "error" ? "text-sm text-destructive" : "text-sm"
          }
        >
          {state.message}
        </p>
      ) : null}
      <Button type="submit" disabled={isPending} className="h-11">
        {isPending ? "Guardando…" : "Guardar dirección"}
      </Button>
    </form>
  );
}
