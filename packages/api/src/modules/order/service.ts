import type { EntityManager } from "@medusajs/framework/mikro-orm/knex";
import type { Context } from "@medusajs/framework/types";
import {
  InjectManager,
  MedusaContext,
  MedusaError,
} from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import nativeOrderModule from "@medusajs/medusa/order";
import { CustomerSpentTotalSchema } from "../../lib/customer-purchases/contracts";

const customerIdsSchema = z.array(z.string().min(1)).max(100);
const customerSpentRowSchema = CustomerSpentTotalSchema.extend({
  customer_id: z.string().min(1),
  amount: z.coerce.number().nonnegative(),
});

const NativeOrderService = nativeOrderModule.service;

export default class OrderModuleService extends NativeOrderService {
  @InjectManager()
  async listCustomerSpentTotals(
    customerIds: string[],
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    const ids = [...new Set(customerIdsSchema.parse(customerIds))];
    if (!ids.length) return [];
    if (!context.manager) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "Order manager unavailable.",
      );
    }
    // Order owns both tables. Medusa maintains paid/refunded/transaction totals
    // through native transactions. Never sum a shared cart payment per seller.
    const statement = context.manager.getKnex().raw<{ rows: unknown[] }>(
      `select o.customer_id, o.currency_code,
        sum(greatest(coalesce((s.totals->>'transaction_total')::numeric, 0), 0)) as amount
       from "order" o
       join order_summary s on s.order_id = o.id and s.version = o.version and s.deleted_at is null
       where o.deleted_at is null and o.customer_id in (${ids.map(() => "?").join(", ")})
        and o.is_draft_order = false and o.status not in ('draft', 'canceled') and o.canceled_at is null
        and coalesce((s.totals->>'paid_total')::numeric, 0) > 0
       group by o.customer_id, o.currency_code order by o.customer_id, o.currency_code`,
      ids,
    );
    const transaction = context.manager.getTransactionContext();
    if (transaction) statement.transacting(transaction);
    const result = await statement;
    return z.array(customerSpentRowSchema).parse(result.rows);
  }
}
