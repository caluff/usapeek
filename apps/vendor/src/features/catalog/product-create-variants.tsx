import { Input } from "@/components/ui/input";
import type { ProductImageDTO } from "@medusajs/types";
import {
  ProductPriceField,
  ProductStockField,
} from "./product-price-stock-fields";
import { ProductCreateVariantActions } from "./product-create-variant-actions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CatalogVariant } from "./validation";

export function ProductCreateVariants({
  variants,
  onChange,
  images = [],
  isSingleVariant = false,
}: {
  variants: CatalogVariant[];
  onChange: (variants: CatalogVariant[]) => void;
  images?: Pick<ProductImageDTO, "id" | "url">[];
  isSingleVariant?: boolean;
}) {
  function update(index: number, value: Partial<CatalogVariant>) {
    onChange(
      variants.map((variant, at) =>
        at === index ? { ...variant, ...value } : variant,
      ),
    );
  }
  return (
    <div className="border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Opciones</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead>Precio (USD)</TableHead>
            <TableHead>Existencias</TableHead>
            <TableHead>
              <span className="sr-only">Acciones</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {variants.map((variant, index) => (
            <TableRow key={JSON.stringify(variant.options)}>
              <TableCell className="text-muted-foreground">
                {Object.values(variant.options).join(" / ") || "Variante única"}
              </TableCell>
              <TableCell>
                {isSingleVariant ? (
                  <span>{variant.title}</span>
                ) : (
                  <Input
                    aria-label={`Nombre de variante ${index + 1}`}
                    required
                    maxLength={200}
                    value={variant.title}
                    onChange={(event) =>
                      update(index, { title: event.target.value })
                    }
                    className="min-w-36"
                  />
                )}
              </TableCell>
              <TableCell>
                <ProductPriceField
                  compact
                  value={variant.amount ?? ""}
                  onChange={(amount) => update(index, { amount })}
                />
              </TableCell>
              <TableCell>
                <ProductStockField
                  compact
                  value={variant.stockedQuantity ?? "0"}
                  onChange={(stockedQuantity) =>
                    update(index, { stockedQuantity })
                  }
                />
              </TableCell>
              <TableCell className="text-right">
                <ProductCreateVariantActions
                  variant={variant}
                  images={images}
                  isSingleVariant={isSingleVariant}
                  onSave={(value) => update(index, value)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
