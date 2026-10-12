import { z } from "@medusajs/framework/zod";

const identifiers = z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/)).max(20);

export const StoreSearchProductsSchema = z
  .strictObject({
    query: z.string().trim().max(200).default(""),
    page: z.number().int().min(0).max(999).default(0),
    hitsPerPage: z.number().int().min(1).max(48).default(24),
    category_ids: identifiers.default([]),
    seller_ids: identifiers.default([]),
    min_price: z.number().finite().nonnegative().optional(),
    max_price: z.number().finite().nonnegative().optional(),
    sort: z
      .enum(["relevance", "price_asc", "price_desc", "newest"])
      .default("relevance"),
    region_id: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
    country_code: z.literal("us").default("us"),
  })
  .refine(
    (value) =>
      value.min_price === undefined ||
      value.max_price === undefined ||
      value.min_price <= value.max_price,
    {
      message: "Minimum price must not exceed maximum price.",
      path: ["max_price"],
    },
  );

export type StoreSearchProductsInput = z.input<
  typeof StoreSearchProductsSchema
>;
export type StoreSearchProductsQuery = z.infer<
  typeof StoreSearchProductsSchema
>;
