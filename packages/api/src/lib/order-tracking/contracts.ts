import { OrderStatus } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import { ORDER_TRACKING_TOKEN_PATTERN } from "./access";

export const StoreOrderTrackingInputSchema = z.strictObject({
  token: z.string().min(1).max(2048).regex(ORDER_TRACKING_TOKEN_PATTERN),
});

const timestamp = z.union([z.date(), z.iso.datetime({ offset: true })])
  .transform((value) => value instanceof Date ? value.toISOString() : value);

export const StoreOrderTrackingResponseSchema = z.object({
  order: z.object({
    display_id: z.number().int(),
    custom_display_id: z.string().nullable().default(null),
    created_at: timestamp,
    status: z.enum(OrderStatus),
    delivery_mode: z.enum(["pickup", "shipping", "mixed", "unknown"]).default("unknown"),
    fulfillment_status: z.enum([
      "not_fulfilled", "partially_fulfilled", "fulfilled", "partially_shipped",
      "shipped", "partially_delivered", "delivered", "canceled",
    ]),
    currency_code: z.string().min(1),
    total: z.coerce.number().nonnegative(),
    items: z.array(z.object({
      id: z.string(),
      title: z.string(),
      variant_title: z.string().nullable().default(null),
      thumbnail: z.string().nullable().default(null),
      quantity: z.coerce.number().nonnegative(),
      unit_price: z.coerce.number().nonnegative(),
      detail: z.object({
        fulfilled_quantity: z.coerce.number().nonnegative().nullable().default(null),
        shipped_quantity: z.coerce.number().nonnegative().nullable().default(null),
        delivered_quantity: z.coerce.number().nonnegative().nullable().default(null),
      }).nullable().default(null),
      variant: z.object({
        product: z.object({
          thumbnail: z.string().nullish(),
          images: z.array(z.object({ url: z.string() })).nullish(),
        }).nullish(),
      }).nullish(),
    }).transform(({ variant, ...item }) => ({
      ...item,
      thumbnail: item.thumbnail?.trim() || variant?.product?.thumbnail?.trim()
        || variant?.product?.images?.find((image) => image.url.trim())?.url || null,
    }))),
    fulfillments: z.array(z.object({
      id: z.string(),
      created_at: timestamp.nullable().default(null),
      delivery_mode: z.enum(["pickup", "shipping", "unknown"]).default("unknown"),
      packed_at: timestamp.nullable().default(null),
      shipped_at: timestamp.nullable().default(null),
      delivered_at: timestamp.nullable().default(null),
      canceled_at: timestamp.nullable().default(null),
      labels: z.array(z.object({
        tracking_number: z.string().nullable().default(null),
        tracking_url: z.string().nullable().default(null),
      })).default([]),
    })).default([]),
  }),
});

export type StoreOrderTrackingInput = z.infer<typeof StoreOrderTrackingInputSchema>;
export type StoreOrderTrackingResponse = z.infer<typeof StoreOrderTrackingResponseSchema>;
