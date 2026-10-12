import { orderSearchQuery } from "@usapeek/order-reference";
import { orderListInput } from "./parameters";

export type OrderListInput = ReturnType<typeof orderListInput>;

export function orderListQuery(input: OrderListInput) {
  return {
    q: orderSearchQuery(input.q) || undefined,
    offset: input.offset,
    limit: input.limit,
    order: "-created_at",
    ...input.tab.filters,
  };
}

export function orderListDataHref(sellerId: string, input: OrderListInput) {
  return `/seller/orders/data?${new URLSearchParams({
    seller_id: sellerId,
    tab: input.tab.value,
    page: String(input.page),
    ...(input.q ? { q: input.q } : {}),
  })}`;
}

export function orderListRequestInput(params: URLSearchParams) {
  const value = (name: string) => {
    const values = params.getAll(name);
    return values.length === 1 ? values[0] : values;
  };
  return orderListInput({
    q: value("q"),
    page: value("page"),
    tab: value("tab"),
  });
}
