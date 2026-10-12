import Link from "next/link";
import { Suspense } from "react";
import { ListSearch } from "@/components/list-search";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePagination } from "@/components/table-pagination";
import { DataEmpty, DataError } from "../workspace/components";
import { resultOf } from "../workspace/data";
import type { scopedClient } from "../workspace/operations";
import { listInput } from "../workspace/presentation";
import { inventoryPage } from "./data";
import type { WarehouseResult } from "./warehouse-card";
import { InventoryStock, StockSkeleton } from "./inventory-stock";

type InventoryResult = ReturnType<
  typeof resultOf<Awaited<ReturnType<typeof inventoryPage>>>
>;

export async function InventoryResults({
  client,
  searchParams,
  warehouse,
}: {
  client: ReturnType<typeof scopedClient>;
  searchParams: Promise<{ q?: string; page?: string }>;
  warehouse: WarehouseResult;
}) {
  const input = listInput(await searchParams);
  const result = resultOf(inventoryPage(client, input));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <ListSearch
          q={input.q}
          path="/seller/inventory"
          label="Buscar por nombre del producto"
          placeholder="Buscar producto…"
        />
        {input.q ? (
          <Link
            href="/seller/inventory"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Limpiar búsqueda
          </Link>
        ) : null}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Producto</TableHead>
            <TableHead className="text-right">En almacén</TableHead>
            <TableHead className="text-right">Reservadas</TableHead>
            <TableHead className="text-right">Disponibles</TableHead>
            <TableHead>
              <span className="sr-only">Acciones</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <Suspense
            key={`${input.page}:${input.q}`}
            fallback={<InventoryRowsSkeleton />}
          >
            <InventoryItems result={result} q={input.q} warehouse={warehouse} />
          </Suspense>
        </TableBody>
      </Table>
      <Suspense fallback={null}>
        <InventoryPagination result={result} input={input} />
      </Suspense>
    </div>
  );
}

async function InventoryItems({
  result,
  q,
  warehouse,
}: {
  result: InventoryResult;
  q: string;
  warehouse: WarehouseResult;
}) {
  const response = await result;
  if (!response.data)
    return (
      <TableRow>
        <TableCell colSpan={5}>
          <DataError message={response.error} />
        </TableCell>
      </TableRow>
    );
  if (!response.data.inventory_items.length)
    return (
      <TableRow>
        <TableCell colSpan={5}>
          <DataEmpty
            title={
              q
                ? "No encontramos ese producto"
                : "Aún no tienes artículos en inventario"
            }
            description={
              q
                ? "Prueba con otro nombre o limpia la búsqueda."
                : "Los productos con control de existencias aparecerán aquí."
            }
          />
          {!q ? (
            <div className="pb-6 text-center">
              <Link
                className="text-sm underline underline-offset-4"
                href="/seller/catalog"
              >
                Ir al catálogo
              </Link>
            </div>
          ) : null}
        </TableCell>
      </TableRow>
    );
  return response.data.inventory_items.map((item) => (
    <Suspense key={item.id} fallback={<StockSkeleton item={item} />}>
      <InventoryStock item={item} warehouse={warehouse} />
    </Suspense>
  ));
}

async function InventoryPagination({
  result,
  input,
}: {
  result: InventoryResult;
  input: ReturnType<typeof listInput>;
}) {
  const response = await result;
  if (!response.data) return null;
  return (
    <TablePagination
      label="Artículos"
      count={response.data.count}
      offset={input.offset}
      limit={input.limit}
      itemCount={response.data.inventory_items.length}
      hrefForOffset={(offset) =>
        `/seller/inventory?page=${Math.floor(offset / input.limit) + 1}&q=${encodeURIComponent(input.q)}`
      }
    />
  );
}

export function InventoryRowsSkeleton() {
  return [0, 1, 2].map((index) => <StockSkeleton key={index} />);
}
