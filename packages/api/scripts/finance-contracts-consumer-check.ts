import type {
  FinanceReportingPeriod,
  FinanceReportingQuery,
  FinanceReportingResponse,
  OrderFinanceInput,
} from "../.mercur/finance-contracts";

const period: FinanceReportingPeriod = "last_30_days";
const query: FinanceReportingQuery = {
  period,
  mode: "test",
  currency_code: "usd",
  data_kind: "ordinary",
};
const operation: OrderFinanceInput = {
  action: "capture",
  note: "Manual capture",
  request_id: "00000000-0000-4000-8000-000000000001",
  confirm: true,
};

export function readFinanceContract(
  response: FinanceReportingResponse,
): { period: FinanceReportingQuery["period"]; sales: number } {
  return {
    period: query.period,
    sales: response.report.sales.length + (operation.confirm ? 0 : 1),
  };
}
