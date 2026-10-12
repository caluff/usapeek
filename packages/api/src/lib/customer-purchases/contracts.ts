import { z } from "@medusajs/framework/zod";

export const AdminCustomerPurchasesQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export const CustomerSpentTotalSchema = z.strictObject({
  currency_code: z.string().min(1),
  amount: z.number().nonnegative(),
});

const customerPurchasesSchema = z.strictObject({
  id: z.string().min(1),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  has_account: z.boolean().nullable(),
  purchase_count: z.number().int().positive(),
  spent_totals: z.array(CustomerSpentTotalSchema),
});

export const AdminCustomerPurchasesResponseSchema = z.strictObject({
  customers: z
    .array(
      customerPurchasesSchema.extend({
        is_deleted: z.boolean(),
      }),
    )
    .max(100),
  count: z.number().int().nonnegative(),
  limit: z.number().int().min(1).max(100),
  offset: z.number().int().nonnegative(),
});

export const AdminCustomerPurchasesDetailResponseSchema = z.strictObject({
  customer: customerPurchasesSchema.extend({
    addresses: z.array(
      z.strictObject({
        address_1: z.string().nullable(),
        address_2: z.string().nullable(),
        city: z.string().nullable(),
        province: z.string().nullable(),
        postal_code: z.string().nullable(),
        country_code: z.string().nullable(),
      }),
    ),
  }),
  orders: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        display_id: z.number().int(),
        custom_display_id: z.string().nullable(),
        created_at: z.iso.datetime({ offset: true }),
        status: z.string(),
        payment_status: z.string().nullable(),
        currency_code: z.string().min(1),
        total: z.number().nonnegative(),
        seller_name: z.string().nullable(),
        items: z.array(
          z.strictObject({
            title: z.string(),
            variant_title: z.string().nullable(),
            quantity: z.number().nonnegative(),
          }),
        ),
      }),
    )
    .max(100),
  count: z.number().int().nonnegative(),
  limit: z.number().int().min(1).max(100),
  offset: z.number().int().nonnegative(),
});

export type AdminCustomerPurchasesQuery = z.infer<
  typeof AdminCustomerPurchasesQuerySchema
>;
export type AdminCustomerPurchasesResponse = z.infer<
  typeof AdminCustomerPurchasesResponseSchema
>;
export type CustomerSpentTotal = z.infer<typeof CustomerSpentTotalSchema>;
export type AdminCustomerPurchasesDetailResponse = z.infer<
  typeof AdminCustomerPurchasesDetailResponseSchema
>;
