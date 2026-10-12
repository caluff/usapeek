import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type CommerceAutomationService from "../../modules/commerce-automation/service";
import { ORDER_NOTIFICATIONS_MODULE } from "../../modules/order-notifications";
import type OrderNotificationsService from "../../modules/order-notifications/service";

// Reconciliation is already a workflow. Its journal method owns and awaits an
// independent committed transaction; signals must never precede that commit.
export async function saveSettlementProjectionAndNotify(
  container: MedusaContainer,
  journal: Pick<CommerceAutomationService, "saveVendorSettlementProjection">,
  input: Parameters<
    CommerceAutomationService["saveVendorSettlementProjection"]
  >[0],
) {
  const saved = await journal.saveVendorSettlementProjection(input);
  if (!saved) return false;
  try {
    const notifications = container.resolve<OrderNotificationsService>(
      ORDER_NOTIFICATIONS_MODULE,
    );
    // Successful native source/CAS validation establishes seller ownership.
    // The event only requests a fresh read: unknown amounts stay unconfirmed.
    await Promise.all(
      [...new Set(input.source.map((row) => row.seller_id))].map((sellerId) =>
        notifications.publishSettlementsChanged(sellerId),
      ),
    );
  } catch {
    // A transport outage must not turn a committed projection into a failed
    // financial write. Reconnected streams read the registry after ready.
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(
        "Settlement projection saved; live refresh notification unavailable.",
      );
  }
  return true;
}
