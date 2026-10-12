import { z } from "@medusajs/framework/zod";
import { VendorAddProductVariant } from "@mercurjs/core/api/vendor/products/validators";
import { MedusaError } from "@medusajs/framework/utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { requireSellerWarehouse } from "../vendor-warehouse/access";
import { SHIPPING_PROFILE_ARCHIVED_KEY } from "../vendor-shipping/configuration";

export const InitialVariantOfferSchema = z.strictObject({
  amount: z.number().finite().nonnegative(),
  stocked_quantity: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  shipping_profile_id: z.string().trim().min(1),
});
export const CreateCompleteVariantSchema = z.strictObject({
  variant: VendorAddProductVariant,
  images: z
    .strictObject({
      ids: z.array(z.string().min(1)).max(6),
      uploads: z
        .array(z.strictObject({ url: z.string().min(1).max(2048) }))
        .max(6),
    })
    .refine(
      ({ ids, uploads }) => ids.length + uploads.length <= 6,
      "Use at most six variant images.",
    ),
  offer: InitialVariantOfferSchema,
});
export type CreateCompleteVariant = z.infer<typeof CreateCompleteVariantSchema>;
export const StagedVariantOfferSchema = InitialVariantOfferSchema.extend({
  seller_id: z.string().min(1),
  member_id: z.string().min(1),
  variant_sku: z.string().min(1),
  variant_id: z.string().min(1),
});

export async function requireInitialVariantOfferResources(
  container: MedusaContainer,
  sellerId: string,
  profileId: string,
) {
  await requireSellerWarehouse(container, sellerId);
  const { data } = await container
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph(
      {
        entity: "shipping_profile_seller",
        fields: ["shipping_profile_id"],
        filters: { seller_id: sellerId, shipping_profile_id: profileId },
      },
      { cache: { enable: false } },
    );
  if (data.length !== 1)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "El perfil de envío no pertenece a esta tienda.",
    );
  const { data: profiles } = await container
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph(
      {
        entity: "shipping_profile",
        fields: ["id", "metadata"],
        filters: { id: profileId },
      },
      { cache: { enable: false } },
    );
  if (
    !profiles[0] ||
    profiles[0].metadata?.[SHIPPING_PROFILE_ARCHIVED_KEY] === true
  )
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Selecciona un perfil de envío activo.",
    );
}
