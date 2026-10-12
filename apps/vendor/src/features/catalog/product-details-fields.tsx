"use client";

import { useId } from "react";
import type { ProductDTO } from "@mercurjs/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";

export function ProductDetailsFields({
  product,
  onTitleChange,
}: {
  product?: ProductDTO;
  onTitleChange?: (title: string) => void;
}) {
  const prefix = useId();
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field>
        <FieldLabel htmlFor={`${prefix}-title`}>Nombre *</FieldLabel>
        <Input
          id={`${prefix}-title`}
          name="title"
          required
          maxLength={200}
          defaultValue={product?.title}
          onChange={(event) => onTitleChange?.(event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${prefix}-subtitle`}>Resumen breve</FieldLabel>
        <Input
          id={`${prefix}-subtitle`}
          name="subtitle"
          maxLength={200}
          defaultValue={product?.subtitle ?? ""}
        />
      </Field>
      <Field className="sm:col-span-2">
        <FieldLabel htmlFor={`${prefix}-handle`}>URL del producto</FieldLabel>
        <Input
          id={`${prefix}-handle`}
          name="handle"
          maxLength={200}
          defaultValue={product?.handle ?? ""}
          placeholder="Se genera a partir del nombre"
        />
      </Field>
      <Field className="sm:col-span-2">
        <FieldLabel htmlFor={`${prefix}-description`}>
          Descripción detallada
        </FieldLabel>
        <Textarea
          id={`${prefix}-description`}
          name="description"
          aria-describedby={`${prefix}-description-help`}
          rows={4}
          maxLength={10000}
          defaultValue={product?.description ?? ""}
        />
        <FieldDescription id={`${prefix}-description-help`}>
          Describe sus características, uso y contenido.
        </FieldDescription>
      </Field>
    </div>
  );
}
