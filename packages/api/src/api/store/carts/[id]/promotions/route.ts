import { POST as addPromotions } from "@mercurjs/core/api/store/carts/[id]/promotions/route";
import { DELETE as removePromotions } from "@medusajs/medusa/api/store/carts/[id]/promotions/route";
import { withStoreCartOwnership } from "../../../cart-ownership/route-guard";

export async function POST(req: Parameters<typeof addPromotions>[0], res: Parameters<typeof addPromotions>[1]) {
  return withStoreCartOwnership(req, res, addPromotions);
}

export async function DELETE(req: Parameters<typeof removePromotions>[0], res: Parameters<typeof removePromotions>[1]) {
  return withStoreCartOwnership(req, res, removePromotions);
}
