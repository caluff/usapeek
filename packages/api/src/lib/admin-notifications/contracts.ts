import { z } from "@medusajs/framework/zod";

export const AdminOrderCountResponseSchema = z.strictObject({ count: z.number().int().nonnegative().safe() });
export type AdminOrderCountResponse = z.infer<typeof AdminOrderCountResponseSchema>;

export const AdminNotificationEventSchema = z.enum([
  "applications-changed",
  "catalog-changed",
  "orders-changed",
  "stores-changed",
  "finance-reporting-changed",
]);
export type AdminNotificationEvent = z.infer<typeof AdminNotificationEventSchema>;

export const AdminPendingNotificationSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("ready"), has_pending: z.boolean() }),
  z.strictObject({ status: z.literal("denied") }),
  z.strictObject({ status: z.literal("unavailable") }),
]);
export const AdminNotificationsResponseSchema = z.strictObject({
  applications: AdminPendingNotificationSchema,
  catalog: AdminPendingNotificationSchema,
});
export type AdminNotificationsResponse = z.infer<
  typeof AdminNotificationsResponseSchema
>;
