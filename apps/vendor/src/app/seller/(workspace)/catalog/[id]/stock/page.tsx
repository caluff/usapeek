import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import type { HttpTypes } from "@mercurjs/types";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeading, DataError } from "@/features/workspace/components";
import { workspace, resultOf } from "@/features/workspace/data";
import {
  catalogInventory,
  catalogStockOffers,
} from "@/features/catalog/commerce-data";
import { sellerWarehouse } from "@/features/inventory/data";
import {
  InventoryStock,
  StockSkeleton,
} from "@/features/inventory/inventory-stock";
import { resourceId } from "@/features/workspace/validation";

export const metadata: Metadata = {
  title: "Existencias del producto",
  description: "Revisa las unidades en almacén, reservadas y disponibles para las variantes de un producto de tu tienda.",
};
function StockTable({ children }: { children: ReactNode }) {
  return (
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
      <TableBody>{children}</TableBody>
    </Table>
  );
}
async function ProductStock({ id }: { id: string }) {
  const { client } = await workspace();
  const result = await resultOf(
    client.get<HttpTypes.VendorProductResponse>(
      `/vendor/products/${resourceId(id)}`,
      {
        fields:
          "id,title,thumbnail,variants.id,variants.title,variants.options.value,variants.options.option.title",
      },
    ),
  );
  if (!result.data) return <DataError message={result.error} />;
  const { product } = result.data;
  const warehouse = resultOf(sellerWarehouse(client));
  const offers = await resultOf(
    catalogStockOffers(
      client,
      product.variants?.map((variant) => variant.id) ?? [],
    ),
  );
  if (!offers.data) return <DataError message={offers.error} />;
  const items = catalogInventory(offers.data).map((item) => ({
    ...item,
    offers: offers.data
      .filter((offer) =>
        offer.inventory_item_link?.some(
          (link) => link.inventory_item?.id === item.id,
        ),
      )
      .map((offer) => ({
        id: offer.id,
        product: {
          id: product.id,
          title: product.title,
          thumbnail: product.thumbnail,
        },
        product_variant: product.variants?.find(
          (variant) => variant.id === offer.variant_id,
        ),
      })),
  }));
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{product.title}</h2>
      {!items.length ? (
        <p className="text-sm text-muted-foreground">
          Configura el precio y las existencias iniciales desde el detalle del
          producto.
        </p>
      ) : (
        <StockTable>
          {items.map((item) => (
            <Suspense key={item.id} fallback={<StockSkeleton item={item} />}>
              <InventoryStock item={item} warehouse={warehouse} />
            </Suspense>
          ))}
        </StockTable>
      )}
    </div>
  );
}
export default async function StockPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeading eyebrow="Catálogo" title="Existencias del producto" />
      <Link
        href={`/seller/catalog/${id}`}
        className="inline-block text-sm underline"
      >
        Volver al producto
      </Link>
      <Suspense
        fallback={
          <StockTable>
            <StockSkeleton />
          </StockTable>
        }
      >
        <ProductStock id={id} />
      </Suspense>
    </div>
  );
}
