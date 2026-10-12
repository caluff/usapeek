import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type CommerceAutomationService from "../../modules/commerce-automation/service";
import { ORDER_NOTIFICATIONS_MODULE } from "../../modules/order-notifications";
import type OrderNotificationsService from "../../modules/order-notifications/service";

export async function saveReportingProjectionAndNotify(
  container: MedusaContainer,
  journal: Pick<CommerceAutomationService, "saveVendorReportingProjection">,
  input: Parameters<CommerceAutomationService["saveVendorReportingProjection"]>[0],
) {
  const saved = await journal.saveVendorReportingProjection(input);
  if (!saved) return false;
  try {
    const notifications = container.resolve<OrderNotificationsService>(
      ORDER_NOTIFICATIONS_MODULE,
    );
    // The journal commits validated native sources before requesting a fresh
    // read. The signal carries no financial data or assertion of confirmation.
    await Promise.all(
      [...new Set(input.source.map((row) => row.seller_id))].map((sellerId) =>
        notifications.publishReportingChanged(sellerId),
      ),
    );
    await notifications.publishAdminChanged("finance-reporting-changed");
  } catch {
    // Redis failure cannot reverse a committed write. Reconnection readiness
    // causes clients to read the registry again.
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn("Reporting projection saved; live refresh notification unavailable.");
  }
  return true;
}
