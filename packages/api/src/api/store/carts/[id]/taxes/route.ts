import { POST as calculateTaxes } from "@medusajs/medusa/api/store/carts/[id]/taxes/route";
import { withStoreCartOwnership } from "../../../cart-ownership/route-guard";

export async function POST(req: Parameters<typeof calculateTaxes>[0], res: Parameters<typeof calculateTaxes>[1]) {
  return withStoreCartOwnership(req, res, calculateTaxes);
}
