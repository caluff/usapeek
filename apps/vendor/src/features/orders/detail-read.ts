import "server-only";

import { cache } from "react";
import {
  ORDER_FIELDS,
  workspace,
  type VendorOrderDetailResponse,
} from "../workspace/data";
import { resourceId } from "../workspace/validation";

export const readOrderDetail = cache(async (id: string) => {
  resourceId(id);
  const { client } = await workspace();
  return client.get<VendorOrderDetailResponse>(`/vendor/orders/${id}`, {
    fields: ORDER_FIELDS,
  });
});
