import { resolvePermissions } from "@medusajs/framework";
import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http";
import { MedusaError, PolicyOperation } from "@medusajs/framework/utils";
import type { SellerNotificationEvent } from "./notification-stream";

export async function sellerNotificationTopics(req: AuthenticatedMedusaRequest) {
  if (!req.seller_context?.seller_id)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Seller scope is required.",
    );

  // ensureSellerMiddleware refreshes these roles for the selected membership.
  // Resolve individual permissions rather than requiring every topic's policy.
  const roles = req.auth_context.app_metadata?.roles;
  const roleIds =
    Array.isArray(roles) && roles.every((role) => typeof role === "string")
      ? (roles as string[])
      : [];
  const granted = await resolvePermissions({
    roles: roleIds,
    universe: [
      { resource: "order", operation: PolicyOperation.read },
      { resource: "product", operation: PolicyOperation.read },
    ],
    container: req.scope,
  });
  const topics: SellerNotificationEvent[] = [];
  if (granted.has("order:read"))
    topics.push(
      "orders-changed",
      "settlements-changed",
      "finance-reporting-changed",
    );
  if (granted.has("product:read")) topics.push("catalog-changed");
  if (!topics.length)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "No notification topics are permitted.",
    );
  return topics;
}
