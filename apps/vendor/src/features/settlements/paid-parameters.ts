import type { VendorEarningsQuery } from "@usapeek/api/finance-contracts";
import {
  financePeriodHref,
  financePeriodInput,
} from "../finance-reporting/periods";
import { listInput } from "../workspace/presentation";

export type PaidSettlementSearchParams = {
  page?: string | string[];
  period?: string | string[];
};

export function paidSettlementListInput(params: PaidSettlementSearchParams) {
  const pagination = listInput(params, 10);
  return {
    page: pagination.page,
    query: {
      period: financePeriodInput(params.period),
      mode: "test",
      currency_code: "usd",
      data_kind: "ordinary",
      limit: pagination.limit,
      offset: pagination.offset,
    } satisfies VendorEarningsQuery,
  };
}

export function paidSettlementListHref(
  input: ReturnType<typeof paidSettlementListInput>,
  page = input.page,
) {
  return financePeriodHref(
    input.query.period,
    page,
    "/seller/settlements/paid",
  );
}
