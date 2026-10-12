import "server-only";

import type { HttpTypes } from "@medusajs/types";
import { authorizeVendor } from "../workspace/data";
import {
  RETURN_CHANGE_FIELDS,
  RETURN_FIELDS,
  type ReturnClient,
  type ReturnRecord,
} from "./return-operations";

export async function vendorReturnClient(): Promise<ReturnClient> {
  const { sdk, membership } = await authorizeVendor();
  const headers = { "x-seller-id": membership.seller.id };
  const post = (path: string, body: object) =>
    sdk.client.fetch<HttpTypes.AdminReturnResponse>(path, {
      method: "POST",
      body,
      headers,
      cache: "no-store",
    });
  const remove = (path: string) =>
    sdk.client.fetch<HttpTypes.AdminReturnResponse>(path, {
      method: "DELETE",
      headers,
      cache: "no-store",
    });
  return {
    initiateRequest: (body) => post("/vendor/returns", body),
    addReturnItem: (id, body) =>
      post(`/vendor/returns/${id}/request-items`, body),
    updateRequest: (id, body) => post(`/vendor/returns/${id}`, body),
    confirmRequest: (id, body) => post(`/vendor/returns/${id}/request`, body),
    cancelRequest: (id) => remove(`/vendor/returns/${id}/request`),
    cancel: (id) => post(`/vendor/returns/${id}/cancel`, {}),
    initiateReceive: (id, body) => post(`/vendor/returns/${id}/receive`, body),
    receiveItems: (id, body) =>
      post(`/vendor/returns/${id}/receive-items`, body),
    dismissItems: (id, body) =>
      post(`/vendor/returns/${id}/dismiss-items`, body),
    confirmReceive: (id, body) =>
      post(`/vendor/returns/${id}/receive/confirm`, body),
    cancelReceive: (id) => remove(`/vendor/returns/${id}/receive`),
    retrieve: (id) =>
      sdk.client.fetch<{ return: ReturnRecord }>(`/vendor/returns/${id}`, {
        query: { fields: RETURN_FIELDS },
        headers,
        cache: "no-store",
      }),
    changes: (id) =>
      sdk.client.fetch<HttpTypes.AdminOrderChangesResponse>(
        `/vendor/orders/${id}/changes`,
        { query: { fields: RETURN_CHANGE_FIELDS }, headers, cache: "no-store" },
      ),
  };
}
