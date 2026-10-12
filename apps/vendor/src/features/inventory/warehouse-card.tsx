import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataError } from "../workspace/components";
import type { resultOf } from "../workspace/data";
import type { WarehouseState } from "./data";
import { RecheckWarehouse } from "./recheck-warehouse";

export type WarehouseResult = ReturnType<typeof resultOf<WarehouseState>>;

export async function WarehouseCard({
  result,
  compact = false,
}: {
  result: WarehouseResult;
  compact?: boolean;
}) {
  const response = await result;
  if (!response.data) return <DataError message={response.error} />;
  const warehouse = response.data;
  if (warehouse.status !== "ready") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            {warehouse.status === "missing"
              ? "Almacén pendiente"
              : "El almacén necesita revisión"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p role="status" className="text-sm leading-6 text-muted-foreground">
            {warehouse.status === "missing"
              ? "Todavía no hay un almacén disponible para esta tienda. El operador debe completar la configuración con la dirección de tu solicitud aprobada."
              : "No pudimos confirmar un único almacén con la dirección aprobada. Solicita al operador revisar los vínculos y la configuración antes de ajustar existencias."}
          </p>
          <RecheckWarehouse />
        </CardContent>
      </Card>
    );
  }
  const { location } = warehouse;
  const address = location.address!;
  if (compact)
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-medium">{location.name}</span>
        <span className="text-muted-foreground">
          {[address.city, address.province].filter(Boolean).join(", ")}
        </span>
      </div>
    );
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-4">
        <CardTitle>{location.name}</CardTitle>
        <Badge variant="success">Almacén aprobado</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <address className="text-sm not-italic leading-6">
          {address.address_1}
          {address.address_2 ? (
            <>
              <br />
              {address.address_2}
            </>
          ) : null}
          <br />
          {[address.city, address.province, address.postal_code]
            .filter(Boolean)
            .join(", ")}
          <br />
          Estados Unidos
        </address>
        <p className="text-sm text-muted-foreground">
          Esta dirección proviene de tu solicitud aprobada. Para corregirla,
          contacta al operador.
        </p>
      </CardContent>
    </Card>
  );
}

export function InventorySkeleton({
  warehouse = false,
}: {
  warehouse?: boolean;
}) {
  return (
    <div
      role="status"
      aria-label={warehouse ? "Cargando almacén" : "Cargando inventario"}
      className="space-y-4"
    >
      {Array.from({ length: warehouse ? 1 : 3 }, (_, index) => (
        <Card key={index} aria-hidden="true">
          <CardContent className="space-y-4 py-6 motion-safe:animate-pulse">
            <div className="h-5 w-48 rounded bg-muted" />
            <div className="h-4 w-64 max-w-full rounded bg-muted" />
            <div
              className={
                warehouse
                  ? "h-12 w-40 rounded bg-muted"
                  : "h-24 rounded bg-muted"
              }
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
