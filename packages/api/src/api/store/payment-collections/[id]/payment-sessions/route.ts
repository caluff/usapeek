import { POST as createPaymentSessions } from "@medusajs/medusa/api/store/payment-collections/[id]/payment-sessions/route";
import { withStoreCartOwnership } from "../../../cart-ownership/route-guard";
import { assertPaymentCollectionSellersReadyForSale } from "../../../../../lib/stripe-connect/sale-readiness";
import { assertPaymentCollectionProductsNotPaused } from "../../../../../lib/catalog/sale-pause";

export async function POST(req: Parameters<typeof createPaymentSessions>[0], res: Parameters<typeof createPaymentSessions>[1]) {
  return withStoreCartOwnership(req, res, async (request, response) => {
    await assertPaymentCollectionProductsNotPaused(request.scope, request.params.id);
    await assertPaymentCollectionSellersReadyForSale(request.scope, request.params.id);
    return createPaymentSessions(request, response);
  });
}
