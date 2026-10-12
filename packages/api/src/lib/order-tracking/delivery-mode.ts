import { z } from "@medusajs/framework/zod";

const optionMode = z.object({
  shipping_option: z.object({
    metadata: z.record(z.string(), z.unknown()).nullish(),
    service_zone: z.object({
      fulfillment_set: z.object({ type: z.string() }).nullish(),
    }).nullish(),
  }).nullish(),
});

export function fulfillmentDeliveryMode(value: unknown): "pickup" | "shipping" | "unknown" {
  const option = optionMode.safeParse(value);
  if (option.success && option.data.shipping_option?.metadata?.marketplace_v2_pickup === true) return "pickup";
  const type = option.success ? option.data.shipping_option?.service_zone?.fulfillment_set?.type : null;
  return type === "pickup" || type === "shipping" ? type : "unknown";
}

export function orderDeliveryMode(methods: unknown): "pickup" | "shipping" | "mixed" | "unknown" {
  if (!Array.isArray(methods) || !methods.length) return "unknown";
  const modes = new Set(methods.map(fulfillmentDeliveryMode));
  if (modes.has("unknown")) return "unknown";
  if (modes.size > 1) return "mixed";
  return modes.has("pickup") ? "pickup" : "shipping";
}
