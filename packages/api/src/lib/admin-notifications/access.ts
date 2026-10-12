import { resolvePermissions } from "@medusajs/framework";
import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http";
import { MedusaError, PolicyOperation } from "@medusajs/framework/utils";
import { requireReviewer } from "../vendor-onboarding/access";
import { OnboardingError } from "../vendor-onboarding/errors";
import { requireFinanceOperator } from "../order-finance/settlement-authorization";
import type { AdminNotificationEvent } from "./contracts";

export async function adminNotificationAccess(
  req: AuthenticatedMedusaRequest,
  includeFinance = true,
) {
  const roles = req.auth_context.app_metadata?.roles;
  const roleIds = Array.isArray(roles)
    ? roles.filter((role): role is string => typeof role === "string")
    : [];
  const granted = await resolvePermissions({
    roles: roleIds,
    universe: ["product", "order", "seller"].map((resource) => ({
      resource,
      operation: PolicyOperation.read,
    })),
    container: req.scope,
  });
  const topics: AdminNotificationEvent[] = [];
  if (granted.has("product:read")) topics.push("catalog-changed");
  if (granted.has("order:read")) topics.push("orders-changed");
  if (granted.has("seller:read")) topics.push("stores-changed");

  let applications: "allowed" | "denied" | "unavailable" = "denied";
  if (
    granted.has("seller:read") &&
    req.auth_context.actor_type === "user" &&
    req.auth_context.auth_identity_id
  ) {
    try {
      await requireReviewer(req.scope, req.auth_context.actor_id, "read");
      applications = "allowed";
      topics.push("applications-changed");
    } catch (error) {
      if (!(error instanceof OnboardingError && error.status === 403))
        applications = "unavailable";
    }
  }
  if (includeFinance) {
    try {
      // The existing admin report authorizes an existing operator rather than
      // declaring an RBAC resource. Keep that exact authority for its signal.
      await requireFinanceOperator(req.scope, req.auth_context.actor_id);
      topics.push("finance-reporting-changed");
    } catch (error) {
      if (!(error instanceof MedusaError && error.type === MedusaError.Types.NOT_ALLOWED))
        throw error;
    }
  }
  return { topics, applications, catalog: granted.has("product:read") };
}
