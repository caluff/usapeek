import "server-only";

import type { VendorOrderCompletionResponse } from "@usapeek/api/order-notification-contracts";
import { cache } from "react";
import { resultOf, workspace } from "../workspace/data";
import { resourceId } from "../workspace/validation";

async function loadOrderCompletion(id: string) {
  resourceId(id);
  const { client } = await workspace();
  return client.get<VendorOrderCompletionResponse>(
    `/vendor/orders/${id}/completion`,
  );
}

export const readOrderCompletion = cache((id: string) =>
  resultOf(loadOrderCompletion(id)),
);
