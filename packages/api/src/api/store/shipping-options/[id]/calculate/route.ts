import { POST as calculateShippingOption } from "@medusajs/medusa/api/store/shipping-options/[id]/calculate/route";
import { withStoreCartOwnership } from "../../../cart-ownership/route-guard";

export async function POST(req: Parameters<typeof calculateShippingOption>[0], res: Parameters<typeof calculateShippingOption>[1]) {
  return withStoreCartOwnership(req, res, calculateShippingOption);
}
