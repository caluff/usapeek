"use client";

import { useRef, useState } from "react";
import { Ellipsis, SlidersHorizontal } from "lucide-react";
import type { ProductImageDTO } from "@medusajs/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProductAttributesFields } from "./product-attributes-fields";
import { specificationDraft } from "./product-specifications";
import { VariantMediaFields } from "./variant-media-fields";
import type { CatalogVariant } from "./validation";

type Props = {
  variant: CatalogVariant;
  images: Pick<ProductImageDTO, "id" | "url">[];
  isSingleVariant: boolean;
  onSave: (value: Partial<CatalogVariant>) => void;
};

export function ProductCreateVariantActions(props: Props) {
  const [isOpen, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={trigger}
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Acciones de ${props.variant.title || "la variante"}`}
          >
            <Ellipsis className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          onCloseAutoFocus={(event) => {
            if (isOpen) event.preventDefault();
          }}
        >
          <DropdownMenuItem onSelect={() => setOpen(true)}>
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            Añadir atributos
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={isOpen} onOpenChange={setOpen}>
        <DialogContent
          className="sm:max-w-2xl"
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              Atributos de {props.variant.title || "la variante"}
            </DialogTitle>
          </DialogHeader>
          <VariantAttributesDraft
            {...props}
            onCancel={() => setOpen(false)}
            onSave={(value) => {
              props.onSave(value);
              setOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function VariantAttributesDraft({
  variant,
  images,
  isSingleVariant,
  onSave,
  onCancel,
}: Props & { onCancel: () => void }) {
  const [specifications, setSpecifications] = useState(
    () => variant.specifications ?? specificationDraft(),
  );
  const [selectedImages, setSelectedImages] = useState(() =>
    (variant.imageIndexes ?? []).flatMap((at) =>
      images[at] ? [images[at].id] : [],
    ),
  );
  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSave({
          specifications,
          imageIndexes: selectedImages.map((id) =>
            images.findIndex((image) => image.id === id),
          ),
        });
      }}
    >
      <ProductAttributesFields
        scope="variant"
        value={specifications}
        onChange={setSpecifications}
      />
      <VariantMediaFields
        images={images}
        selected={selectedImages}
        onChange={setSelectedImages}
        includeGeneralImages={isSingleVariant}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit">Guardar atributos</Button>
      </div>
    </form>
  );
}
