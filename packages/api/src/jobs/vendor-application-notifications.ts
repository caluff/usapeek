import type { Logger, MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, defineFileConfig } from "@medusajs/framework/utils";
import { onboardingEmailConfiguration } from "../lib/vendor-onboarding/email";
import { deliverVendorApplicationNotificationWorkflow } from "../workflows/vendor-application-notifications";

const MAX_NOTIFICATIONS_PER_RUN = 20;

defineFileConfig({ isDisabled: () => process.env.AUTH_EMAIL_ENABLED !== "true" });

export default async function deliverVendorApplicationNotifications(container: MedusaContainer) {
  try {
    if (!onboardingEmailConfiguration()) return;
    for (let index = 0; index < MAX_NOTIFICATIONS_PER_RUN; index++) {
      const { result } = await deliverVendorApplicationNotificationWorkflow(container).run({ input: {} });
      // Drain only real work; failed events must wait for the next scheduled run.
      if (result.status !== "sent") break;
    }
  } catch {
    container.resolve<Logger>(ContainerRegistrationKeys.LOGGER).warn("[vendor-notifications] Processing stopped; retrying on the next scheduled run.");
  }
}
export const config = { name: "vendor-application-notifications", schedule: "* * * * *" };
