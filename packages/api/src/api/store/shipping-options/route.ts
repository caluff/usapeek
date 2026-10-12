import { GET as listShippingOptions } from "@mercurjs/core/api/store/shipping-options/route";
import { withStoreCartOwnership } from "../cart-ownership/route-guard";

export async function GET(req: Parameters<typeof listShippingOptions>[0], res: Parameters<typeof listShippingOptions>[1]) {
  return withStoreCartOwnership(req, res, listShippingOptions);
}
