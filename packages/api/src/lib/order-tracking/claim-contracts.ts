import { z } from "@medusajs/framework/zod";
import { StoreOrderTrackingInputSchema } from "./contracts";

export const StoreOrderTrackingClaimInputSchema = StoreOrderTrackingInputSchema;
export const StoreOrderTrackingClaimResponseSchema = z.strictObject({
  status: z.literal("associated"),
  order_id: z.string().regex(/^order_[a-zA-Z0-9]+$/),
});

export type StoreOrderTrackingClaimInput = z.infer<typeof StoreOrderTrackingClaimInputSchema>;
export type StoreOrderTrackingClaimResponse = z.infer<typeof StoreOrderTrackingClaimResponseSchema>;
