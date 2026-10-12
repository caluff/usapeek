import { FetchError } from "@medusajs/js-sdk";
import type { HttpTypes, OfferDTO, ProductVariantDTO } from "@mercurjs/types";
import type { scopedClient } from "../workspace/operations";
import type { listInput } from "../workspace/presentation";

type Client = ReturnType<typeof scopedClient>;
type VariantOption = NonNullable<ProductVariantDTO["options"]>[number];
type InventoryOffer = Pick<OfferDTO, "id"> & {
  product?: Pick<
    NonNullable<OfferDTO["product"]>,
    "id" | "title" | "thumbnail"
  > | null;
  product_variant?:
    | (Pick<ProductVariantDTO, "id" | "title"> & {
        options?: (Pick<VariantOption, "value"> & {
          option?: Pick<NonNullable<VariantOption["option"]>, "title"> | null;
        })[];
      })
    | null;
};
// Mercur's native list expands this relation, omitted by its base InventoryItemDTO alias.
export type InventoryItemWithLevels = Pick<
  HttpTypes.VendorInventoryItem,
  "id" | "title"
> & {
  offers?: InventoryOffer[];
  location_levels?: Pick<
    HttpTypes.VendorInventoryLevel,
    "id" | "location_id" | "stocked_quantity" | "reserved_quantity"
  >[];
};
type InventoryPageResponse = Omit<
  HttpTypes.VendorInventoryItemListResponse,
  "inventory_items"
> & {
  inventory_items: InventoryItemWithLevels[];
};
export type WarehouseState =
  | {
      status: "ready";
      location: HttpTypes.VendorStockLocationResponse["stock_location"];
    }
  | { status: "missing" | "conflict" };

export async function sellerWarehouse(client: Client): Promise<WarehouseState> {
  try {
    // This projection validates the approved claim, unique link and exclusive ownership server-side.
    const { stock_location } =
      await client.get<HttpTypes.VendorStockLocationResponse>(
        "/vendor/warehouse",
      );
    if (
      !stock_location.id ||
      !stock_location.address?.address_1 ||
      !stock_location.address.city ||
      !stock_location.address.postal_code ||
      stock_location.address.country_code?.toLowerCase() !== "us"
    )
      return { status: "conflict" };
    return { status: "ready", location: stock_location };
  } catch (error) {
    if (error instanceof FetchError && [404, 409].includes(error.status ?? 0))
      return { status: "conflict" };
    throw error;
  }
}

export function inventoryPage(
  client: Client,
  input: ReturnType<typeof listInput>,
) {
  return client.get<InventoryPageResponse>("/vendor/inventory-items", {
    q: input.q || undefined,
    limit: input.limit,
    offset: input.offset,
    fields:
      "id,title,offers.id,offers.product.id,offers.product.title,offers.product.thumbnail,offers.product_variant.id,offers.product_variant.title,offers.product_variant.options.value,offers.product_variant.options.option.title,location_levels.id,location_levels.location_id,location_levels.stocked_quantity,location_levels.reserved_quantity",
  });
}

export function warehouseLevel(
  item: InventoryItemWithLevels,
  locationId: string,
) {
  const levels = item.location_levels;
  if (!levels) return { status: "conflict" } as const;
  if (!levels.length) return { status: "missing" } as const;
  if (levels.length !== 1 || levels[0].location_id !== locationId)
    return { status: "conflict" } as const;
  const level = levels[0];
  const stocked = Number(level.stocked_quantity);
  const reserved = Number(level.reserved_quantity);
  if (
    level.stocked_quantity == null ||
    level.reserved_quantity == null ||
    !Number.isSafeInteger(stocked) ||
    stocked < 0 ||
    !Number.isSafeInteger(reserved) ||
    reserved < 0
  )
    return { status: "conflict" } as const;
  return {
    status: "ready",
    level,
    stocked,
    reserved,
    available: stocked - reserved,
  } as const;
}
