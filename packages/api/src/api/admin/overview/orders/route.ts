import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { AdminOrderCountResponseSchema, type AdminOrderCountResponse } from "../../../../lib/admin-notifications/contracts";

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse<AdminOrderCountResponse>) {
  const { metadata } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order",
    fields: ["id"],
    filters: { is_draft_order: false },
    pagination: { skip: 0, take: 1 },
  }, { cache: { enable: false } });
  res.setHeader("Cache-Control", "private, no-store");
  res.json(AdminOrderCountResponseSchema.parse({ count: metadata?.count }));
}
