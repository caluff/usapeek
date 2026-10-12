import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import type { OfferDTO } from "@mercurjs/types";
import { updateVendorOfferPriceWorkflow } from "../../../../../workflows/update-vendor-offer-price";
import type { UpdateVendorOfferPrice } from "./validators";

export async function POST(
  req: AuthenticatedMedusaRequest<UpdateVendorOfferPrice>,
  res: MedusaResponse<{ offer: Pick<OfferDTO, "id" | "product_id"> }>,
) {
  const { result } = await updateVendorOfferPriceWorkflow(req.scope).run({
    input: {
      ...req.validatedBody,
      offer_id: req.params.id,
      seller_id: req.seller_context?.seller_id || "",
    },
  });
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ offer: result });
}
