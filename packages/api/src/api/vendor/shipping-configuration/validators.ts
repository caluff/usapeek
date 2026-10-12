import { z } from "@medusajs/framework/zod";
import { ShippingCoverage } from "../../../lib/vendor-shipping/coverage";

const name = z.string().trim().min(1).max(100);
const id = z.string().trim().min(1).max(255);
const option = {
  name,
  description: z.string().trim().max(500),
  amount: z.number().finite().min(0).max(1_000_000).multipleOf(0.01),
  coverage: ShippingCoverage.optional(),
};

export const VendorShippingConfiguration = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("set_pickup"), enabled: z.boolean() }),
  z.strictObject({ action: z.literal("create_profile"), name }),
  z.strictObject({ action: z.literal("update_profile"), profile_id: id, name }),
  z.strictObject({
    action: z.literal("set_profile_archived"),
    profile_id: id,
    archived: z.boolean(),
  }),
  z.strictObject({
    action: z.literal("create_option"),
    shipping_profile_id: id,
    ...option,
  }),
  z.strictObject({
    action: z.literal("update_option"),
    option_id: id,
    ...option,
    enabled: z.boolean(),
  }),
]);

export type VendorShippingConfiguration = z.infer<
  typeof VendorShippingConfiguration
>;
