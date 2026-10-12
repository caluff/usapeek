import { z } from "@medusajs/framework/zod";

export const VendorStripeAccountRefresh = z.strictObject({});
export type VendorStripeAccountRefresh = z.infer<
  typeof VendorStripeAccountRefresh
>;
