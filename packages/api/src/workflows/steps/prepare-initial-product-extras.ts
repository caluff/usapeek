import { randomUUID } from "node:crypto";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import type { VendorCreateProductType } from "@mercurjs/core/api/vendor/products/validators";
import type { CreateOfferDTO } from "@mercurjs/types";
import {
  resolveInitialProductExtras,
  validateInitialProductExtras,
  type InitialProductExtras,
} from "../../lib/catalog/initial-product-extras";
import { requireSellerWarehouse } from "../../lib/vendor-warehouse/access";

export const validateInitialProductExtrasStep = createStep(
  "validate-initial-product-extras",
  async (product: VendorCreateProductType) =>
    new StepResponse(validateInitialProductExtras(product)),
);

export const prepareInitialProductExtrasStep = createStep(
  "prepare-initial-product-extras",
  async (
    input: {
      extras: InitialProductExtras;
      variants: Parameters<typeof resolveInitialProductExtras>[1];
      images: Parameters<typeof resolveInitialProductExtras>[2];
      seller_id: string;
      member_id: string;
    },
    { container },
  ) => {
    const resolved = resolveInitialProductExtras(
      input.extras,
      input.variants,
      input.images,
    );
    const warehouseId = resolved.offers.length
      ? await requireSellerWarehouse(container, input.seller_id)
      : undefined;
    const offers: CreateOfferDTO[] = resolved.offers.map((offer) => {
      const sellerSku = `offer-${randomUUID()}`;
      return {
        seller_id: input.seller_id,
        created_by: input.member_id,
        sku: sellerSku,
        variant_id: offer.variant_id,
        shipping_profile_id: offer.shipping_profile_id,
        prices: [{ amount: offer.amount, currency_code: "usd" }],
        inventory_items: [
          {
            sku: sellerSku,
            required_quantity: 1,
            stock_levels: [
              {
                location_id: warehouseId!,
                stocked_quantity: offer.stocked_quantity,
              },
            ],
          },
        ],
        manage_inventory: true,
        allow_backorder: false,
      };
    });
    return new StepResponse({ offers, images: resolved.images });
  },
);
