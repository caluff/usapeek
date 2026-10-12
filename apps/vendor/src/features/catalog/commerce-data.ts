import type { scopedClient } from "../workspace/operations";
import {
  warehouseLevel,
  type InventoryItemWithLevels,
  type WarehouseState,
} from "../inventory/data";
import type { OfferWithPrices } from "../offers/operations";
import type { OfferDTO, OfferInventoryItemLinkDTO } from "@mercurjs/types";

const CATALOG_OFFER_FIELDS =
  "id,variant_id,prices.amount,prices.currency_code,prices.min_quantity,prices.max_quantity,prices.price_rules.attribute,prices.price_rules.value";

// Mercur's flattened inventory_items relation omits pivot columns. Its native
// inventory confirmation workflow reads this link to obtain required_quantity.
export type CatalogStockOffer = Pick<
  OfferDTO,
  "id" | "variant_id" | "manage_inventory"
> & {
  inventory_item_link?: (Pick<
    OfferInventoryItemLinkDTO,
    "required_quantity"
  > & {
    inventory_item?: InventoryItemWithLevels | null;
  })[];
};
const CATALOG_STOCK_FIELDS =
  "id,variant_id,manage_inventory,inventory_item_link.required_quantity,inventory_item_link.inventory_item.id,inventory_item_link.inventory_item.title,inventory_item_link.inventory_item.location_levels.id,inventory_item_link.inventory_item.location_levels.location_id,inventory_item_link.inventory_item.location_levels.stocked_quantity,inventory_item_link.inventory_item.location_levels.reserved_quantity";

async function readOffers<T>(
  client: ReturnType<typeof scopedClient>,
  variantIds: string[],
  fields: string,
) {
  if (!variantIds.length) return [];
  const offers: T[] = [];
  let count = 1;
  while (offers.length < count) {
    const page = await client.get<{ offers: T[]; count: number }>(
      "/vendor/offers",
      {
        variant_id: [...new Set(variantIds)],
        limit: 100,
        offset: offers.length,
        fields,
      },
    );
    if (!page.offers.length && offers.length < page.count)
      throw new Error("No se pudo cargar toda la configuración.");
    offers.push(...page.offers);
    count = page.count;
  }
  return offers;
}

export function catalogOffers(
  client: ReturnType<typeof scopedClient>,
  variantIds: string[],
) {
  return readOffers<OfferWithPrices>(client, variantIds, CATALOG_OFFER_FIELDS);
}

export function catalogStockOffers(
  client: ReturnType<typeof scopedClient>,
  variantIds: string[],
) {
  return readOffers<CatalogStockOffer>(
    client,
    variantIds,
    CATALOG_STOCK_FIELDS,
  );
}

export function catalogInventory(offers: CatalogStockOffer[]) {
  const items = new Map<string, InventoryItemWithLevels>();
  for (const offer of offers) {
    for (const link of offer.inventory_item_link ?? []) {
      const item = link.inventory_item;
      if (typeof item?.id === "string" && item.id) items.set(item.id, item);
    }
  }
  return [...items.values()];
}

export function catalogStock(
  offers: CatalogStockOffer[],
  warehouse?: WarehouseState,
) {
  if (!offers.length) return "Sin configurar";
  if (warehouse?.status !== "ready") return "No disponible";
  const seen = new Set<string>();
  let total = 0;
  for (const offer of offers) {
    const links = offer.inventory_item_link;
    if (!offer.manage_inventory || links?.length !== 1) return "No disponible";
    const link = links[0];
    const item = link.inventory_item;
    const required = Number(link.required_quantity);
    if (
      !item?.id ||
      seen.has(item.id) ||
      !Number.isSafeInteger(required) ||
      required <= 0
    )
      return "No disponible";
    seen.add(item.id);
    const level = warehouseLevel(item, warehouse.location.id);
    if (level.status !== "ready") return "No disponible";
    total += Math.floor(Math.max(0, level.available) / required);
  }
  return total === 0 ? "Sin existencias" : `${total} disponibles`;
}
