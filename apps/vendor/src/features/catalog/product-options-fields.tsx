import { useId } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { variantCombinations } from "./validation";
import {
  parseCatalogOptions,
  type CatalogOptionDraft,
} from "./product-create-draft";

export function ProductOptionsFields({
  hasVariants,
  options,
  onModeChange,
  onOptionsChange,
}: {
  hasVariants: boolean;
  options: CatalogOptionDraft[];
  onModeChange: (hasVariants: boolean) => void;
  onOptionsChange: (options: CatalogOptionDraft[]) => void;
}) {
  const prefix = useId();
  let count = 0;
  try {
    if (options.length)
      count = variantCombinations(parseCatalogOptions(options)).length;
  } catch {
    // Incomplete options are validated when continuing to the next step.
  }
  return (
    <section
      className="space-y-5 border-b pb-6"
      aria-labelledby={`${prefix}-heading`}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          id={`${prefix}-mode`}
          checked={hasVariants}
          onCheckedChange={(checked) => onModeChange(checked === true)}
          aria-describedby={`${prefix}-mode-help`}
          className="mt-1"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <FieldLabel id={`${prefix}-heading`} htmlFor={`${prefix}-mode`}>
              Este producto tiene variantes
            </FieldLabel>
            <Badge variant="outline" className="shrink-0">
              {hasVariants ? "Con variantes" : "Variante única"}
            </Badge>
          </div>
          <FieldDescription id={`${prefix}-mode-help`}>
            {hasVariants
              ? "Define las opciones que el cliente podrá elegir, como tamaño, color o material."
              : "Se creará una variante única. Activa esta opción si vendes diferentes tamaños, colores o materiales."}
          </FieldDescription>
        </div>
      </div>
      {hasVariants ? (
        <div className="space-y-4">
          {options.map((option, index) => (
            <div
              key={index}
              className="grid items-start gap-3 sm:grid-cols-[1fr_2fr_auto]"
            >
              <Field>
                <FieldLabel htmlFor={`${prefix}-option-${index}`}>
                  Opción {index + 1}
                </FieldLabel>
                <Input
                  id={`${prefix}-option-${index}`}
                  placeholder="Por ejemplo, Tamaño"
                  maxLength={100}
                  value={option.title}
                  onChange={(event) =>
                    onOptionsChange(
                      options.map((entry, at) =>
                        at === index
                          ? { ...entry, title: event.target.value }
                          : entry,
                      ),
                    )
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${prefix}-values-${index}`}>
                  Valores
                </FieldLabel>
                <Input
                  id={`${prefix}-values-${index}`}
                  placeholder="Pequeño, Mediano, Grande"
                  aria-describedby={`${prefix}-values-help`}
                  maxLength={3030}
                  value={option.values}
                  onChange={(event) =>
                    onOptionsChange(
                      options.map((entry, at) =>
                        at === index
                          ? { ...entry, values: event.target.value }
                          : entry,
                      ),
                    )
                  }
                />
              </Field>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Quitar opción ${index + 1}`}
                onClick={() =>
                  onOptionsChange(options.filter((_, at) => at !== index))
                }
                className="justify-self-end sm:mt-7"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={options.length >= 3}
              onClick={() =>
                onOptionsChange([...options, { title: "", values: "" }])
              }
            >
              <Plus className="size-4" aria-hidden="true" /> Añadir opción
            </Button>
            {count > 0 ? (
              <p role="status" className="text-sm text-muted-foreground">
                {count === 1
                  ? "Se creará 1 variante"
                  : `Se crearán ${count} variantes`}
              </p>
            ) : null}
          </div>
          <FieldDescription id={`${prefix}-values-help`}>
            Separa los valores con comas. Hasta 3 opciones y 100 combinaciones.
          </FieldDescription>
        </div>
      ) : null}
    </section>
  );
}
