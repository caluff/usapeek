import { TableCell, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { warehouseLevel, type InventoryItemWithLevels } from "./data";
import type { WarehouseResult } from "./warehouse-card";
import { InventoryProduct } from "./inventory-product";
import { InventoryRow } from "./inventory-row";
import { inventoryProducts } from "./presentation";

export async function InventoryStock({
  item,
  warehouse,
}: {
  item: InventoryItemWithLevels;
  warehouse: WarehouseResult;
}) {
  const verified = await warehouse;
  const stock =
    verified.data?.status === "ready"
      ? warehouseLevel(item, verified.data.location.id)
      : null;
  if (stock?.status !== "ready")
    return (
      <TableRow>
        <TableCell>
          <InventoryProduct item={item} />
        </TableCell>
        <TableCell colSpan={4} className="text-sm text-muted-foreground">
          {!stock
            ? "Confirma el almacén para ajustar las existencias."
            : stock.status === "missing"
              ? "Este artículo no tiene existencias en el almacén aprobado. Contacta al operador."
              : "Estas existencias necesitan revisión. Contacta al operador."}
        </TableCell>
      </TableRow>
    );
  const name =
    inventoryProducts(item)
      .map((product) =>
        [product.title, product.presentation].filter(Boolean).join(" · "),
      )
      .join(", ") ||
    item.title ||
    "artículo";
  return (
    <InventoryRow
      identity={<InventoryProduct item={item} />}
      name={name}
      itemId={item.id}
      locationId={stock.level.location_id}
      stocked={stock.stocked}
      reserved={stock.reserved}
      available={stock.available}
    />
  );
}

export function StockSkeleton({ item }: { item?: InventoryItemWithLevels }) {
  return (
    <TableRow aria-busy="true" aria-label="Cargando existencias">
      <TableCell>
        {item ? (
          <InventoryProduct item={item} />
        ) : (
          <div className="flex items-center gap-3">
            <Skeleton data-slot="thumbnail" className="size-12 shrink-0" />
            <Skeleton className="h-4 w-40" />
          </div>
        )}
      </TableCell>
      {[0, 1, 2].map((index) => (
        <TableCell key={index}>
          <Skeleton className="ml-auto h-4 w-8" />
        </TableCell>
      ))}
      <TableCell>
        <Skeleton className="ml-auto h-8 w-20" />
      </TableCell>
    </TableRow>
  );
}
