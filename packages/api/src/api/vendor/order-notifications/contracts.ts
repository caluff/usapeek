import { z } from "@medusajs/framework/zod";
import {
  AdminNotificationEventSchema,
  AdminOrderCountResponseSchema,
  AdminNotificationsResponseSchema,
} from "../../../lib/admin-notifications/contracts";

export const VendorOrderNotificationsResponseSchema = z.strictObject({
  has_pending_orders: z.boolean(),
});

export type VendorOrderNotificationsResponse = z.infer<
  typeof VendorOrderNotificationsResponseSchema
>;

export const VendorOrderCompletionResponseSchema = z.strictObject({
  can_complete: z.boolean(),
  pickup_fulfillment_ids: z.array(z.string().min(1)),
  preparation_groups: z.array(
    z.strictObject({
      shipping_option_id: z.string().min(1).nullable(),
      is_pickup: z.boolean(),
      item_ids: z.array(z.string().min(1)),
    }),
  ),
});
export type VendorOrderCompletionResponse = z.infer<
  typeof VendorOrderCompletionResponseSchema
>;

export type AdminNotificationEvent = z.infer<
  typeof AdminNotificationEventSchema
>;
export type AdminOrderCountResponse = z.infer<
  typeof AdminOrderCountResponseSchema
>;
export type AdminNotificationsResponse = z.infer<
  typeof AdminNotificationsResponseSchema
>;
