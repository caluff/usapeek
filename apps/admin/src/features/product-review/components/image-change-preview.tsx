import Image from "next/image";
import { ImageOff } from "lucide-react";
import { productImageUrl } from "../helpers";

function imageUrl(value: unknown) {
  if (typeof value !== "object" || value === null || !("url" in value))
    return null;
  if (typeof value.url !== "string") return null;
  return productImageUrl(value.url);
}

export function ProductReviewImages({
  value,
  label,
  prominent = false,
  showLabel = true,
}: {
  value: unknown;
  label: string;
  prominent?: boolean;
  showLabel?: boolean;
}) {
  const images = Array.isArray(value) ? value : [];
  return (
    <div className="min-w-0 space-y-3">
      {showLabel && <h4 className="text-sm font-medium">{label}</h4>}
      {images.length === 0 ? (
        prominent ? (
          <div className="flex aspect-square flex-col items-center justify-center gap-3 bg-muted/40 text-muted-foreground">
            <ImageOff aria-hidden="true" className="size-8" strokeWidth={1.5} />
            <p className="text-sm">Sin imágenes</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Sin imágenes</p>
        )
      ) : (
        <ul
          className={
            prominent
              ? "grid grid-cols-3 gap-3"
              : "grid grid-cols-2 gap-3 sm:grid-cols-3"
          }
        >
          {images.map((image: unknown, index: number) => {
            const url = imageUrl(image);
            return (
              <li
                key={index}
                className={`min-w-0 ${prominent && index === 0 ? "col-span-3" : ""}`}
              >
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-md border border-border bg-muted/40 p-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`${label}: abrir imagen ${index + 1} en otra pestaña`}
                  >
                    <Image
                      src={url}
                      alt={`${label}, imagen ${index + 1}`}
                      width={200}
                      height={200}
                      unoptimized
                      className="aspect-square w-full object-contain"
                    />
                  </a>
                ) : (
                  <p className="flex aspect-square items-center justify-center rounded-md border border-border p-3 text-center text-xs text-muted-foreground">
                    Vista previa no disponible
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function ProductChangeDetails({ details }: { details: unknown }) {
  if (
    typeof details === "object" &&
    details !== null &&
    "field" in details &&
    details.field === "images" &&
    "value" in details &&
    Array.isArray(details.value)
  ) {
    return (
      <div className="grid gap-6 rounded-md border border-border p-4 md:grid-cols-2">
        <ProductReviewImages
          label="Imágenes actuales"
          value={"previous_value" in details ? details.previous_value : []}
        />
        <ProductReviewImages
          label="Imágenes propuestas"
          value={details.value}
        />
      </div>
    );
  }
  return (
    <pre className="max-h-72 overflow-auto rounded-md border border-border bg-muted p-4 text-xs">
      {JSON.stringify(details, null, 2)}
    </pre>
  );
}
