import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { HttpTypes } from "@mercurjs/types";
import { OnboardingError } from "../vendor-onboarding/errors";
import { requireSellerWarehouse } from "./access";

export async function sellerWarehouseView(
  container: MedusaContainer,
  sellerId: string,
): Promise<HttpTypes.VendorStockLocationResponse> {
  const id = await requireSellerWarehouse(container, sellerId);
  const { data: locations } = await container
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph(
      {
        entity: "stock_location",
        fields: ["id", "name", "address.*"],
        filters: { id },
      },
      { cache: { enable: false } },
    );
  if (locations.length !== 1 || locations[0].id !== id)
    throw new OnboardingError("warehouse_conflict", 409);
  return {
    // Match the native stock-location HTTP projection; generated graph types include
    // nullable, unrequested fulfillment relations absent from this response.
    stock_location: locations[0] as unknown as HttpTypes.VendorStockLocationResponse["stock_location"],
  };
}
