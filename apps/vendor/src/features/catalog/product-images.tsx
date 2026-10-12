"use client";

import Image from "next/image";
import {
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import { ImagePlus, X } from "lucide-react";
import type { ProductImageDTO } from "@medusajs/types";
import {
  Attachment,
  AttachmentMedia,
  AttachmentContent,
  AttachmentTitle,
  AttachmentDescription,
  AttachmentActions,
  AttachmentAction,
  AttachmentTrigger,
  AttachmentGroup,
} from "@/components/ui/attachment";
import { notifyFeedback } from "@/lib/feedback";
import { CATALOG_IMAGE_COUNT, validateCatalogImages } from "./media-validation";
import { uploadCatalogImageAction } from "./upload-action";
import {
  prepareCatalogImages,
  type CatalogAttachment,
} from "./image-submission";

export type ProductImagesHandle = { prepare: () => Promise<{ url: string }[]> };

export function ProductImages({
  initialImages = [],
  disabled = false,
  onBusyChange,
  onImagesChange,
  onMediaChange,
  scope = "product",
  maxImages = CATALOG_IMAGE_COUNT,
  requiresImage = true,
  ref,
}: {
  initialImages?: Pick<ProductImageDTO, "id" | "url">[];
  disabled?: boolean;
  onBusyChange: (busy: boolean) => void;
  onImagesChange?: (imageIds: string[]) => void;
  onMediaChange?: (images: Pick<ProductImageDTO, "id" | "url">[]) => void;
  scope?: "product" | "variant" | "gallery";
  maxImages?: number;
  requiresImage?: boolean;
  ref: Ref<ProductImagesHandle>;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const objectUrls = useRef(new Set<string>());
  const selecting = useRef(false);
  const [images, setImages] = useState<CatalogAttachment[]>(() =>
    initialImages.map((image, index) => ({
      ...image,
      name: `Imagen ${index + 1}`,
    })),
  );
  const latestImages = useRef(images);
  const [isValidating, setIsValidating] = useState(false);
  const [message, setMessage] = useState("");
  function update(next: CatalogAttachment[]) {
    latestImages.current = next;
    setImages(next);
    onImagesChange?.(next.map((image) => image.id));
    onMediaChange?.(next.map(({ id, url }) => ({ id, url })));
  }
  useEffect(() => {
    const urls = objectUrls.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);
  useImperativeHandle(ref, () => ({
    prepare: () =>
      prepareCatalogImages(
        latestImages.current,
        uploadCatalogImageAction,
        (saved) => {
          const previous = latestImages.current.find(
            (image) => image.id === saved.id,
          );
          update(
            latestImages.current.map((image) =>
              image.id === saved.id ? saved : image,
            ),
          );
          if (previous && objectUrls.current.delete(previous.url))
            URL.revokeObjectURL(previous.url);
        },
        maxImages,
      ),
  }));
  async function select(files: File[]) {
    if (!files.length || selecting.current || disabled) return;
    selecting.current = true;
    setIsValidating(true);
    onBusyChange(true);
    try {
      if (latestImages.current.length + files.length > maxImages)
        throw new Error(
          scope === "variant"
            ? "La variante admite hasta seis imágenes propias."
            : `El producto admite hasta ${maxImages} imágenes.`,
        );
      await validateCatalogImages(files);
      const additions = files.map((file) => {
        const url = URL.createObjectURL(file);
        objectUrls.current.add(url);
        return { id: crypto.randomUUID(), url, name: file.name, file };
      });
      update([...latestImages.current, ...additions]);
      setMessage("");
    } catch (error) {
      const failure =
        error instanceof Error ? error.message : "Revisa los archivos.";
      setMessage(failure);
      notifyFeedback({ status: "error", message: failure });
    } finally {
      selecting.current = false;
      setIsValidating(false);
      onBusyChange(false);
    }
  }
  return (
    <section
      className={scope === "product" ? "space-y-4 border-t pt-5" : "space-y-4"}
      aria-labelledby={`${id}-heading`}
    >
      <div>
        <h3 id={`${id}-heading`} className="text-sm font-medium">
          {scope === "variant"
            ? "Añadir fotos propias"
            : `Imágenes del producto${requiresImage ? " *" : ""}`}
        </h3>
        <p id={`${id}-help`} className="mt-1 text-xs text-muted-foreground">
          {scope === "gallery"
            ? "PNG, JPEG o WebP de hasta 5 MB. Si quitas una foto, también se retira de las variantes que la usen."
            : scope === "variant"
              ? "Hasta seis imágenes propias en PNG, JPEG o WebP de 5 MB. Se cargarán al guardar."
              : requiresImage
                ? "Añade al menos una imagen. Hasta seis PNG, JPEG o WebP de 5 MB. Se cargarán al guardar el producto."
                : "Añade imágenes generales en PNG, JPEG o WebP de 5 MB. Hasta seis; se cargarán al guardar el producto."}
        </p>
      </div>
      <input
        ref={input}
        type="file"
        className="hidden"
        accept="image/png,image/jpeg,image/webp"
        multiple
        disabled={disabled || isValidating}
        aria-label={
          scope === "variant"
            ? "Seleccionar imágenes de la variante"
            : "Seleccionar imágenes del producto"
        }
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          void select(files);
        }}
      />
      <AttachmentGroup>
        {images.map((image, index) => (
          <Attachment
            key={image.id}
            state={disabled && image.file ? "uploading" : "done"}
          >
            <AttachmentMedia>
              <Image
                src={image.url}
                alt={`Imagen ${scope === "variant" ? "de la variante" : "del producto"} ${index + 1}`}
                fill
                sizes="128px"
                unoptimized
                className="object-contain"
              />
            </AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle title={image.name}>{image.name}</AttachmentTitle>
              <AttachmentDescription>
                {image.file ? "Lista para enviar" : "Guardada"}
              </AttachmentDescription>
            </AttachmentContent>
            <AttachmentActions>
              <AttachmentAction
                aria-label={`Quitar imagen ${index + 1}`}
                disabled={disabled || isValidating}
                onClick={() => {
                  if (objectUrls.current.delete(image.url))
                    URL.revokeObjectURL(image.url);
                  update(
                    latestImages.current.filter(
                      (entry) => entry.id !== image.id,
                    ),
                  );
                }}
              >
                <X className="size-4" aria-hidden="true" />
              </AttachmentAction>
            </AttachmentActions>
          </Attachment>
        ))}
        {images.length < maxImages ? (
          <Attachment state="idle">
            <AttachmentMedia>
              <ImagePlus
                className="size-7 text-muted-foreground"
                aria-hidden="true"
              />
            </AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle>
                {isValidating ? "Validando…" : "Añadir imagen"}
              </AttachmentTitle>
              <AttachmentDescription>
                {scope === "gallery"
                  ? `${images.length} ${images.length === 1 ? "imagen" : "imágenes"}`
                  : `${images.length} de ${maxImages} imágenes`}
              </AttachmentDescription>
            </AttachmentContent>
            <AttachmentTrigger
              aria-label="Añadir imagen"
              aria-describedby={`${id}-help`}
              disabled={disabled || isValidating}
              onClick={() => input.current?.click()}
            />
          </Attachment>
        ) : null}
      </AttachmentGroup>
      {message ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}
    </section>
  );
}
