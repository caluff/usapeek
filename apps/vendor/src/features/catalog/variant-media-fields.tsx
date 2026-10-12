import Image from "next/image";
import { useId, type ReactNode } from "react";
import type { ProductImageDTO } from "@medusajs/types";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldDescription } from "@/components/ui/field";

export function VariantMediaFields({
  images,
  selected,
  onChange,
  generalImages = [],
  children,
  maxSelected = 6,
  includeGeneralImages = false,
}: {
  images: Pick<ProductImageDTO, "id" | "url">[];
  selected: string[];
  onChange: (ids: string[]) => void;
  generalImages?: Pick<ProductImageDTO, "id" | "url">[];
  children?: ReactNode;
  maxSelected?: number;
  includeGeneralImages?: boolean;
}) {
  const prefix = useId();
  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 text-sm font-semibold">
        Imágenes de la variante
      </legend>
      <FieldDescription>
        {includeGeneralImages
          ? "La variante única muestra las imágenes generales del producto y sus fotos propias."
          : "Al seleccionar esta variante, se muestran sus fotos propias. Si no tiene, se muestran las imágenes generales del producto."}
      </FieldDescription>
      {generalImages.length ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            {includeGeneralImages
              ? "Imágenes generales del producto"
              : "Imágenes generales de respaldo"}
          </p>
          <div className="flex flex-wrap gap-3">
            {generalImages.map((image, at) => (
              <Image
                key={image.id}
                src={image.url}
                width={96}
                height={96}
                unoptimized
                alt={`Imagen general ${at + 1}`}
                className="size-24 border object-cover"
              />
            ))}
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {images.map((image, at) => (
          <label
            key={image.id}
            htmlFor={`${prefix}-${at}`}
            className={`relative cursor-pointer border p-2 ${selected.includes(image.id) ? "border-primary" : "border-border"}`}
          >
            <Image
              src={image.url}
              width={96}
              height={96}
              unoptimized
              alt={`Foto propia ${at + 1}`}
              className="size-24 object-cover"
            />
            <Checkbox
              id={`${prefix}-${at}`}
              checked={selected.includes(image.id)}
              disabled={
                !selected.includes(image.id) && selected.length >= maxSelected
              }
              onCheckedChange={(checked) =>
                onChange(
                  checked === true
                    ? [...selected, image.id]
                    : selected.filter((id) => id !== image.id),
                )
              }
              aria-label={`Usar imagen ${at + 1} para esta variante`}
              className="absolute right-3 top-3"
            />
          </label>
        ))}
      </div>
      {!images.length && !children ? (
        <p className="text-sm text-muted-foreground">
          Añade primero imágenes al producto.
        </p>
      ) : null}
      {children}
    </fieldset>
  );
}
