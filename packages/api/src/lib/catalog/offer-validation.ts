import type { MedusaContainer } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import type {
  BatchOfferInventoryItemsDTO,
  CreateOfferDTO,
  UpdateOfferDTO,
} from "@mercurjs/types";
import { ProductChangeActionType } from "@mercurjs/types";
import { requireSellerWarehouse } from "../vendor-warehouse/access";

const invalid = (message: string): never => {
  throw new MedusaError(MedusaError.Types.INVALID_DATA, message);
};
const forbidden: () => never = () => {
  throw new MedusaError(
    MedusaError.Types.NOT_ALLOWED,
    "Offer references unavailable seller resources.",
  );
};

export function validateOfferPrices(
  prices: CreateOfferDTO["prices"],
  creating = true,
) {
  if (!prices.length) invalid("An offer requires a price.");
  for (const price of prices) {
    if (
      !Number.isFinite(price.amount) ||
      price.amount < 0 ||
      (creating && price.currency_code !== "usd")
    )
      invalid("New offer prices must be non-negative USD display amounts.");
    if (
      price.min_quantity != null &&
      (!Number.isSafeInteger(price.min_quantity) || price.min_quantity < 1)
    )
      invalid("Invalid minimum quantity.");
    if (
      price.max_quantity != null &&
      (!Number.isSafeInteger(price.max_quantity) ||
        price.max_quantity < (price.min_quantity ?? 1))
    )
      invalid("Invalid price quantity range.");
  }
}

export async function validateOfferEligibility(
  container: MedusaContainer,
  sellerId: string,
  variantId: string,
  shippingProfileId: string,
) {
  await validateOfferEligibilityBatch(container, sellerId, [
    { variant_id: variantId, shipping_profile_id: shippingProfileId },
  ]);
}

async function validateOfferEligibilityBatch(
  container: MedusaContainer,
  sellerId: string,
  offers: Pick<CreateOfferDTO, "variant_id" | "shipping_profile_id">[],
) {
  if (!offers.length) return;
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const [{ data: variants }, { data: profiles }, { data: sellers }] =
    await Promise.all([
      query.graph(
        {
          entity: "product_variant",
          fields: ["id", "product.id", "product.status"],
          filters: {
            id: [...new Set(offers.map((offer) => offer.variant_id))],
          },
        },
        { cache: { enable: false } },
      ),
      query.graph(
        {
          entity: "shipping_profile_seller",
          fields: ["shipping_profile_id"],
          filters: {
            seller_id: sellerId,
            shipping_profile_id: [
              ...new Set(offers.map((offer) => offer.shipping_profile_id)),
            ],
          },
        },
        { cache: { enable: false } },
      ),
      query.graph(
        {
          entity: "seller",
          fields: ["id", "status"],
          filters: { id: sellerId },
        },
        { cache: { enable: false } },
      ),
    ]);
  if (sellers[0]?.status !== "open") forbidden();
  const byVariant = new Map(
    variants.map((variant) => [variant.id, variant.product]),
  );
  const profileIds = new Set(
    profiles.map((profile) => profile.shipping_profile_id),
  );
  const pendingProductIds = [
    ...new Set(
      variants.flatMap((variant) =>
        variant.product &&
        ["draft", "proposed"].includes(variant.product.status)
          ? [variant.product.id]
          : [],
      ),
    ),
  ];
  const { data: additions } = pendingProductIds.length
    ? await query.graph(
        {
          entity: "product_change_action",
          fields: ["product_id"],
          filters: {
            product_id: pendingProductIds,
            action: ProductChangeActionType.PRODUCT_ADD,
            product_change: { created_by: sellerId },
          },
        },
        { cache: { enable: false } },
      )
    : { data: [] };
  const ownPendingProducts = new Set(
    additions.map((addition) => addition.product_id),
  );
  for (const offer of offers) {
    const product = byVariant.get(offer.variant_id);
    if (
      !product ||
      (product.status !== "published" && !ownPendingProducts.has(product.id)) ||
      !profileIds.has(offer.shipping_profile_id)
    )
      forbidden();
  }
  const { data: restrictions } = await query.graph(
    {
      entity: "product_seller",
      fields: ["product_id", "seller_id"],
      filters: {
        product_id: [
          ...new Set(
            variants.flatMap((variant) =>
              variant.product ? [variant.product.id] : [],
            ),
          ),
        ],
      },
    },
    { cache: { enable: false } },
  );
  const restrictedProducts = new Set(restrictions.map((row) => row.product_id));
  const allowedProducts = new Set(
    restrictions
      .filter((row) => row.seller_id === sellerId)
      .map((row) => row.product_id),
  );
  for (const offer of offers) {
    const productId = byVariant.get(offer.variant_id)!.id;
    if (restrictedProducts.has(productId) && !allowedProducts.has(productId))
      forbidden();
  }
}

export async function validateOfferCreation(
  container: MedusaContainer,
  offers: CreateOfferDTO[],
) {
  if (!offers.length || offers.length > 100)
    invalid("Invalid offer batch size.");
  const sellerId = offers[0].seller_id;
  if (offers.some((offer) => offer.seller_id !== sellerId)) forbidden();
  const warehouseId = await requireSellerWarehouse(container, sellerId);
  const seen = new Set<string>();
  for (const offer of offers) {
    if (seen.has(offer.variant_id))
      invalid("Duplicate variant in offer batch.");
    seen.add(offer.variant_id);
    if (!offer.sku.trim() || offer.sku.length > 100)
      invalid("Offers require a seller SKU.");
    validateOfferPrices(offer.prices);
    if (!offer.inventory_items.length) invalid("An offer requires inventory.");
    for (const item of offer.inventory_items) {
      if (
        item.stock_levels?.length !== 1 ||
        item.stock_levels[0].location_id !== warehouseId
      )
        forbidden();
      if (
        !Number.isSafeInteger(item.stock_levels![0].stocked_quantity) ||
        item.stock_levels![0].stocked_quantity < 0
      )
        invalid("Invalid initial inventory quantity.");
    }
  }
  await validateOfferEligibilityBatch(container, sellerId, offers);
}

export async function validateOfferUpdates(
  container: MedusaContainer,
  updates: UpdateOfferDTO[],
) {
  if (!updates.length) return;
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: offers } = await query.graph(
    {
      entity: "offer",
      fields: ["id", "seller_id", "variant_id", "shipping_profile_id"],
      filters: { id: [...new Set(updates.map((update) => update.id))] },
    },
    { cache: { enable: false } },
  );
  const byId = new Map(offers.map((offer) => [offer.id, offer]));
  const bySeller = new Map<
    string,
    Pick<CreateOfferDTO, "variant_id" | "shipping_profile_id">[]
  >();
  for (const update of updates) {
    const offer = byId.get(update.id);
    if (!offer) forbidden();
    if (update.prices) validateOfferPrices(update.prices, false);
    const entries = bySeller.get(offer.seller_id) ?? [];
    entries.push({
      variant_id: offer.variant_id,
      shipping_profile_id:
        update.shipping_profile_id ?? offer.shipping_profile_id,
    });
    bySeller.set(offer.seller_id, entries);
  }
  // Bound concurrency across sellers; each seller's resources are fetched in one batch.
  for (const [sellerId, entries] of bySeller)
    await validateOfferEligibilityBatch(container, sellerId, entries);
}

export async function validateOfferInventory(
  container: MedusaContainer,
  input: BatchOfferInventoryItemsDTO,
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: offers } = await query.graph(
    {
      entity: "offer",
      fields: ["id", "seller_id", "inventory_items.id"],
      filters: { id: input.offer_id },
    },
    { cache: { enable: false } },
  );
  const offer = offers[0];
  if (!offer) forbidden();
  const ids = [
    ...new Set([
      ...(input.create ?? []).map((row) => row.inventory_item_id),
      ...(input.update ?? []).map((row) => row.inventory_item_id),
      ...(input.delete ?? []),
    ]),
  ];
  if (!ids.length) return;
  const [{ data: items }, warehouseId, { data: levels }] = await Promise.all([
    query.graph(
      {
        entity: "inventory_item_seller",
        fields: ["inventory_item_id"],
        filters: { seller_id: offer.seller_id, inventory_item_id: ids },
      },
      { cache: { enable: false } },
    ),
    requireSellerWarehouse(container, offer.seller_id),
    query.graph(
      {
        entity: "inventory_level",
        fields: ["inventory_item_id", "location_id"],
        filters: { inventory_item_id: ids },
      },
      { cache: { enable: false } },
    ),
  ]);
  if (
    items.length !== ids.length ||
    levels.some((level) => level.location_id !== warehouseId)
  )
    forbidden();
  const linked = new Set((offer.inventory_items ?? []).map((item) => item?.id));
  for (const entry of input.update ?? [])
    if (!linked.has(entry.inventory_item_id)) forbidden();
}
