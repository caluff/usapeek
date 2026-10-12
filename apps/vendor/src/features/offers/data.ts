import type { HttpTypes } from "@mercurjs/types";
import type { scopedClient } from "../workspace/operations";

export function offerConfiguration(client: ReturnType<typeof scopedClient>) {
  return Promise.all([
    client.get<HttpTypes.VendorStockLocationListResponse>(
      "/vendor/stock-locations",
      { limit: 2, fields: "id,name" },
    ),
    client.get<HttpTypes.VendorShippingProfileListResponse>(
      "/vendor/shipping-profiles",
      { limit: 100, fields: "id,name,metadata" },
    ),
  ]);
}
