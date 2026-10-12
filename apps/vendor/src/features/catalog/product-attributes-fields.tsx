"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  PRODUCT_MEASUREMENTS,
  PRODUCT_TEXT_ATTRIBUTES,
  type SpecificationDraft,
} from "./product-specifications";

export function ProductAttributesFields({
  value,
  onChange,
  namePrefix = "",
  scope = "product",
}: {
  value: SpecificationDraft;
  onChange: (value: SpecificationDraft) => void;
  namePrefix?: string;
  scope?: "product" | "variant";
}) {
  const prefix = useId();
  return (
    <div className="space-y-5">
      <FieldDescription id={`${prefix}-help`}>
        {scope === "variant"
          ? "Los campos vacíos quedan sin especificar."
          : "Estos atributos describen el producto. Cada variante puede tener sus propios atributos."}
      </FieldDescription>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor={`${prefix}-material`}>Material</FieldLabel>
          <Input
            id={`${prefix}-material`}
            name={`${namePrefix}material`}
            maxLength={200}
            value={value.material}
            aria-describedby={`${prefix}-help`}
            onChange={(event) =>
              onChange({ ...value, material: event.target.value })
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${prefix}-weight`}>Peso (g)</FieldLabel>
          <Input
            id={`${prefix}-weight`}
            name={`${namePrefix}weight`}
            type="number"
            inputMode="decimal"
            min="0.001"
            step="any"
            value={value.weight}
            aria-describedby={`${prefix}-help`}
            onChange={(event) =>
              onChange({ ...value, weight: event.target.value })
            }
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {PRODUCT_MEASUREMENTS.filter(({ name }) => name !== "weight").map(
          ({ name, label }) => (
            <Field key={name}>
              <FieldLabel htmlFor={`${prefix}-${name}`}>{label}</FieldLabel>
              <Input
                id={`${prefix}-${name}`}
                name={`${namePrefix}${name}`}
                type="number"
                inputMode="decimal"
                min="0.001"
                step="any"
                value={value[name]}
                aria-describedby={`${prefix}-help`}
                onChange={(event) =>
                  onChange({ ...value, [name]: event.target.value })
                }
              />
            </Field>
          ),
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {PRODUCT_TEXT_ATTRIBUTES.filter(({ name }) => name !== "material").map(
          ({ name, label }) => (
            <Field key={name}>
              <FieldLabel htmlFor={`${prefix}-${name}`}>{label}</FieldLabel>
              <Input
                id={`${prefix}-${name}`}
                name={`${namePrefix}${name}`}
                maxLength={name === "origin_country" ? 2 : 200}
                pattern={name === "origin_country" ? "[a-zA-Z]{2}" : undefined}
                value={value[name]}
                placeholder={
                  name === "origin_country" ? "Por ejemplo, US" : undefined
                }
                onChange={(event) =>
                  onChange({ ...value, [name]: event.target.value })
                }
              />
            </Field>
          ),
        )}
      </div>
    </div>
  );
}
