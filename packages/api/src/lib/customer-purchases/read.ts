import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { MercurModules } from "@mercurjs/types";
import type SellerModuleService from "../../modules/seller/service";
import type OrderModuleService from "../../modules/order/service";
import {
  AdminCustomerPurchasesResponseSchema,
  type AdminCustomerPurchasesQuery,
  type AdminCustomerPurchasesResponse,
} from "./contracts";

export async function readAdminCustomerPurchases(
  container: MedusaContainer,
  input: AdminCustomerPurchasesQuery,
): Promise<AdminCustomerPurchasesResponse> {
  const purchases = await container
    .resolve<SellerModuleService>(MercurModules.SELLER)
    .listCustomerPurchaseCounts(input);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const ids = purchases.customers.map((buyer) => buyer.customer_id);
  const [{ data: customers }, spent] = purchases.customers.length
    ? await Promise.all([
        query.graph(
          {
            entity: "customer",
            fields: [
              "id",
              "first_name",
              "last_name",
              "email",
              "phone",
              "has_account",
            ],
            filters: {
              id: ids,
            },
          },
          { cache: { enable: false } },
        ),
        container
          .resolve<OrderModuleService>(Modules.ORDER)
          .listCustomerSpentTotals(ids),
      ])
    : [{ data: [] }, []];
  const byId = new Map(customers.map((customer) => [customer.id, customer]));

  return AdminCustomerPurchasesResponseSchema.parse({
    customers: purchases.customers.map(({ customer_id, purchase_count }) => {
      const customer = byId.get(customer_id);
      return {
        id: customer_id,
        first_name: customer?.first_name ?? null,
        last_name: customer?.last_name ?? null,
        email: customer?.email ?? null,
        phone: customer?.phone ?? null,
        has_account: customer?.has_account ?? null,
        purchase_count,
        spent_totals: spent
          .filter((total) => total.customer_id === customer_id)
          .map(({ currency_code, amount }) => ({ currency_code, amount })),
        // Native deletion keeps historical group IDs. Preserve pagination but
        // never recover a deleted customer's personal data from old orders.
        is_deleted: !customer,
      };
    }),
    count: purchases.count,
    limit: input.limit,
    offset: input.offset,
  });
}
