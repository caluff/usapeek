import type { EntityManager } from "@medusajs/framework/mikro-orm/knex";
import type { Context } from "@medusajs/framework/types";
import {
  InjectManager,
  MedusaContext,
  MedusaError,
} from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import nativeSellerModule from "@mercurjs/core/modules/seller";
import {
  AdminCustomerPurchasesQuerySchema,
  type AdminCustomerPurchasesQuery,
} from "../../lib/customer-purchases/contracts";

const customerPurchaseCountsSchema = z.strictObject({
  customers: z
    .array(
      z.strictObject({
        customer_id: z.string().min(1),
        purchase_count: z.number().int().positive(),
      }),
    )
    .max(100),
  count: z.coerce.number().int().nonnegative(),
});

// OrderGroup is owned by Seller. One row represents the whole checkout, so
// seller child orders never multiply a buyer's purchase count. Both the page
// and total share one database snapshot, including when the offset is empty.
const CUSTOMER_PURCHASE_COUNTS_SQL = `with buyers as (
  select customer_id, count(*) as purchase_count
  from order_group
  where deleted_at is null and customer_id is not null and customer_id <> ''
  group by customer_id
), page as (
  select customer_id, purchase_count from buyers
  order by purchase_count desc, customer_id asc limit ? offset ?
)
select coalesce((select jsonb_agg(page order by purchase_count desc, customer_id asc) from page), '[]'::jsonb) as customers,
  (select count(*) from buyers) as count`;

const NativeSellerService = nativeSellerModule.service;

export default class SellerModuleService extends NativeSellerService {
  @InjectManager()
  async countCustomerPurchases(
    customerId: string,
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    const id = z.string().min(1).parse(customerId);
    if (!context.manager) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "Seller manager unavailable.",
      );
    }
    const statement = context.manager
      .getKnex()
      .raw<{ rows: unknown[] }>(
        "select count(*) as count from order_group where deleted_at is null and customer_id = ?",
        [id],
      );
    const transaction = context.manager.getTransactionContext();
    if (transaction) statement.transacting(transaction);
    const result = await statement;
    return z
      .object({ count: z.coerce.number().int().nonnegative() })
      .parse(result.rows[0]).count;
  }

  @InjectManager()
  async listCustomerPurchaseCounts(
    input: AdminCustomerPurchasesQuery,
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    const { limit, offset } = AdminCustomerPurchasesQuerySchema.parse(input);
    if (!context.manager) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "Seller manager unavailable.",
      );
    }
    const statement = context.manager
      .getKnex()
      .raw<{ rows: unknown[] }>(CUSTOMER_PURCHASE_COUNTS_SQL, [limit, offset]);
    const transaction = context.manager.getTransactionContext();
    if (transaction) statement.transacting(transaction);
    const result = await statement;
    return customerPurchaseCountsSchema.parse(result.rows[0]);
  }
}
