import type Medusa from "@medusajs/js-sdk";
import type {
  AdminCustomerPurchasesResponse,
  AdminCustomerPurchasesDetailResponse,
} from "@usapeek/api/customer-contracts";
import type { parseCustomerPagination } from "./helpers";

export function listPurchasingCustomers(
  client: Pick<Medusa["client"], "fetch">,
  pagination: ReturnType<typeof parseCustomerPagination>,
) {
  return client.fetch<AdminCustomerPurchasesResponse>(
    "/admin/customer-purchases",
    { query: pagination, cache: "no-store" },
  );
}

export function retrieveCustomerPurchases(
  client: Pick<Medusa["client"], "fetch">,
  id: string,
  offset: number,
  signal: AbortSignal,
) {
  return client.fetch<AdminCustomerPurchasesDetailResponse>(
    `/admin/customer-purchases/${encodeURIComponent(id)}`,
    { query: { limit: 10, offset }, cache: "no-store", signal },
  );
}
