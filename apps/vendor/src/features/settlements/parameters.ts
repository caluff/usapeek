import type { VendorSettlementsQuery } from "@usapeek/api/finance-contracts";
import { listInput } from "../workspace/presentation";

export type SettlementSearchParams = {
  page?: string | string[];
  data_kind?: string | string[];
};

export function settlementListInput(params: SettlementSearchParams) {
  const pagination = listInput(params, 10);
  return {
    page: pagination.page,
    query: {
      mode: "test",
      currency_code: "usd",
      data_kind: "ordinary",
      limit: pagination.limit,
      offset: pagination.offset,
    } satisfies VendorSettlementsQuery,
  };
}

export function settlementListHref(
  input: ReturnType<typeof settlementListInput>,
  page = input.page,
) {
  return `/seller/settlements?${new URLSearchParams({
    page: String(page),
  })}`;
}
