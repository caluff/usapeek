import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { ProductChangeStatus, ProductStatus } from "@mercurjs/types";
import { ORDER_NOTIFICATIONS_MODULE } from "../../modules/order-notifications";
import type OrderNotificationsService from "../../modules/order-notifications/service";
import { onboardingService } from "../vendor-onboarding/access";
import { adminNotificationAccess } from "./access";
import type { AdminNotificationsResponse } from "./contracts";

async function pendingCatalog(req: AuthenticatedMedusaRequest) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const [proposed, changes] = await Promise.all([
    query.graph(
      {
        entity: "product",
        fields: ["id"],
        filters: { status: ProductStatus.PROPOSED },
        pagination: { take: 1 },
      },
      { cache: { enable: false } },
    ),
    // Native preview reviews pending ProductChanges. Initial creation instead
    // records a confirmed audit change and a proposed product. Query each
    // module's queue directly, including edits of already published products.
    query.graph(
      {
        entity: "product_change",
        fields: ["id"],
        filters: { status: ProductChangeStatus.PENDING },
        pagination: { take: 1 },
      },
      { cache: { enable: false } },
    ),
  ]);
  return proposed.data.length > 0 || changes.data.length > 0;
}

export async function readAdminNotifications(
  req: AuthenticatedMedusaRequest,
  fresh = false,
): Promise<AdminNotificationsResponse> {
  const access = await adminNotificationAccess(req, false);
  const notifications = req.scope.resolve<OrderNotificationsService>(
    ORDER_NOTIFICATIONS_MODULE,
  );
  const read = async (
    topic: "applications-changed" | "catalog-changed",
    allowed: boolean,
    compute: () => Promise<boolean>,
  ): Promise<AdminNotificationsResponse["applications"]> => {
    if (!allowed) return { status: "denied" };
    try {
      return {
        status: "ready",
        has_pending: await notifications.adminSnapshot(topic, compute, fresh),
      };
    } catch {
      return { status: "unavailable" };
    }
  };
  const [applications, catalog] = await Promise.all([
    access.applications === "unavailable"
      ? Promise.resolve({ status: "unavailable" } as const)
      : read("applications-changed", access.applications === "allowed", async () => {
          const applications = await onboardingService(req.scope).listVendorApplications(
            { status: "submitted" },
            { select: ["id"], take: 1 },
          );
          return applications.length > 0;
        }),
    read("catalog-changed", access.catalog, () => pendingCatalog(req)),
  ]);
  return { applications, catalog };
}
