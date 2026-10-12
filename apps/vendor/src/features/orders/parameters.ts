import { listInput } from "../workspace/presentation";
import { DEFAULT_TABLE_PAGE_SIZE } from "@usapeek/ui/pagination-utils";

export const ORDER_TABS = [
  { value: "all", label: "Todos", filters: {} },
  {
    value: "pending",
    label: "Pendientes",
    filters: {
      status: "pending",
      fulfillment_stage: "pending",
    },
  },
  {
    value: "fulfilled",
    label: "Preparados",
    filters: {
      status: "pending",
      fulfillment_stage: "prepared",
    },
  },
  {
    value: "shipped",
    label: "Enviados",
    filters: {
      status: "pending",
      fulfillment_stage: "shipped",
    },
  },
  {
    value: "completed",
    label: "Completados",
    filters: { status: "completed" },
  },
  { value: "canceled", label: "Cancelados", filters: { status: "canceled" } },
  {
    value: "refunded",
    label: "Reembolsados",
    filters: { refund_status: "refunded" },
  },
] as const;

const LEGACY_ORDER_TABS: Record<string, string> = {
  not_fulfilled: "pending",
  partially_fulfilled: "fulfilled",
  partially_shipped: "shipped",
  partially_delivered: "shipped",
  delivered: "shipped",
};

export function orderListInput(params: {
  q?: string | string[];
  page?: string | string[];
  tab?: string | string[];
}) {
  const tabValue =
    typeof params.tab === "string"
      ? (LEGACY_ORDER_TABS[params.tab] ?? params.tab)
      : "all";
  return {
    ...listInput(params, DEFAULT_TABLE_PAGE_SIZE),
    tab: ORDER_TABS.find((tab) => tab.value === tabValue) ?? ORDER_TABS[0],
  };
}

export function orderListHref(
  input: ReturnType<typeof orderListInput>,
  page = input.page,
) {
  return `/seller/orders?${new URLSearchParams({
    tab: input.tab.value,
    page: String(page),
    ...(input.q ? { q: input.q } : {}),
  })}`;
}
