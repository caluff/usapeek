import type { SellerMemberDTO } from "@mercurjs/types";
import { TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ProductRowActions } from "./product-row-actions";
import type { scopedClient } from "../workspace/operations";
import { resultOf } from "../workspace/data";
import { formatMoney } from "../workspace/presentation";
import { baseUsdPrice } from "../offers/operations";
import { sellerWarehouse } from "../inventory/data";
import {
  catalogOffers,
  catalogStockOffers,
  catalogStock,
} from "./commerce-data";

export function catalogCommerce(
  client: ReturnType<typeof scopedClient>,
  variantIds: string[],
) {
  const offers = resultOf(catalogOffers(client, variantIds));
  const stock = resultOf(catalogStockOffers(client, variantIds));
  const warehouse = variantIds.length
    ? resultOf(sellerWarehouse(client))
    : Promise.resolve({ data: undefined });
  return { offers, stock, warehouse };
}

type Commerce = ReturnType<typeof catalogCommerce>;

export async function CatalogSaleActions({
  data,
  seller,
  productId,
  title,
  variantIds,
}: {
  data: Commerce;
  seller: SellerMemberDTO["seller"];
  productId: string;
  title: string;
  variantIds: string[];
}) {
  const result = await data.offers;
  const pausedIds = seller.metadata?.marketplace_v2_paused_products;
  const paused =
    pausedIds == null || Array.isArray(pausedIds)
      ? Array.isArray(pausedIds) && pausedIds.includes(productId)
      : undefined;
  const configured = result.data?.some((offer) =>
    variantIds.includes(offer.variant_id),
  );
  return (
    <div className="flex items-center gap-2">
      {paused ? <Badge variant="warning">Venta pausada</Badge> : null}
      <ProductRowActions
        productId={productId}
        title={title}
        paused={paused}
        configured={configured}
      />
    </div>
  );
}

export async function CatalogPriceCell({
  data,
  variantIds,
}: {
  data: Commerce;
  variantIds: string[];
}) {
  const result = await data.offers;
  if (!result.data) return <TableCell>No disponible</TableCell>;
  const offers = result.data.filter((offer) =>
    variantIds.includes(offer.variant_id),
  );
  if (!offers.length) return <TableCell>Sin configurar</TableCell>;
  let price = "Revisar precios";
  try {
    const amounts = offers.map((offer) => {
      const base = baseUsdPrice(offer.prices ?? []);
      if (!base || !Number.isFinite(Number(base.amount)))
        throw new Error("Precio incompleto");
      return Number(base.amount);
    });
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);
    price =
      min === max
        ? formatMoney(min, "USD")
        : `${formatMoney(min, "USD")} – ${formatMoney(max, "USD")}`;
  } catch {
    /* Keep an explicit incomplete-price state. */
  }
  return (
    <TableCell className="tabular-nums">
      {price}
      {offers.length < variantIds.length ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {offers.length} de {variantIds.length} presentaciones configuradas
        </p>
      ) : null}
    </TableCell>
  );
}

export async function CatalogStockCell({
  data,
  variantIds,
}: {
  data: Commerce;
  variantIds: string[];
}) {
  const result = await data.stock;
  if (!result.data) return <TableCell>No disponible</TableCell>;
  const offers = result.data.filter((offer) =>
    variantIds.includes(offer.variant_id),
  );
  // Rows without offers can resolve without waiting for the warehouse or inventory.
  if (!offers.length) return <TableCell>Sin configurar</TableCell>;
  const warehouse = await data.warehouse;
  return (
    <TableCell className="tabular-nums">
      {catalogStock(offers, warehouse.data)}
    </TableCell>
  );
}
