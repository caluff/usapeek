import type { Logger, MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, defineFileConfig } from "@medusajs/framework/utils";
import { commerceAutomationEnabled } from "../lib/commerce-automation/configuration";
import { evaluateCommerceWorkflow } from "../workflows/evaluate-commerce";

defineFileConfig({ isDisabled: () => !commerceAutomationEnabled() });

export default async function evaluateCommerce(container: MedusaContainer) {
  if (!commerceAutomationEnabled()) return;
  try {
    await evaluateCommerceWorkflow(container).run({ input: {} });
  } catch {
    container
      .resolve<Logger>(ContainerRegistrationKeys.LOGGER)
      .warn(
        "[commerce-automation] Evaluation stopped; persisted claims require reconciliation.",
      );
  }
}

export const config = { name: "evaluate-commerce", schedule: "*/15 * * * *" };
