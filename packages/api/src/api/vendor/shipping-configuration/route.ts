import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { configureVendorShippingWorkflow } from "../../../workflows/configure-vendor-shipping";
import type { VendorShippingConfiguration } from "./validators";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { VendorShippingConfigurationResponse } from "../../../lib/vendor-shipping/coverage";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<VendorShippingConfigurationResponse>,
) {
  const { data: sellers } = await req.scope
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph(
      {
        entity: "seller",
        fields: ["metadata"],
        filters: { id: req.seller_context?.seller_id || "" },
      },
      { cache: { enable: false } },
    );
  res.setHeader("Cache-Control", "private, no-store");
  res.json({
    pickup_enabled:
      sellers[0]?.metadata?.marketplace_v2_pickup_enabled === true,
  });
}

export async function POST(
  req: AuthenticatedMedusaRequest<VendorShippingConfiguration>,
  res: MedusaResponse,
) {
  await configureVendorShippingWorkflow(req.scope).run({
    input: {
      seller_id: req.seller_context?.seller_id || "",
      configuration: req.validatedBody,
    },
  });
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ success: true });
}
