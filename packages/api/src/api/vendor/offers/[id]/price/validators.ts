import { z } from "@medusajs/framework/zod";

const amount = z.number().finite().min(0).max(999_999_999.99);
const text = z.string().min(1).max(100);

export const UpdateVendorOfferPrice = z.strictObject({
  amount,
  expected_amount: amount.nullable(),
  sku: text,
  expected_sku: text,
  shipping_profile_id: z.string().min(1),
  expected_shipping_profile_id: z.string().min(1),
});

export type UpdateVendorOfferPrice = z.infer<typeof UpdateVendorOfferPrice>;
