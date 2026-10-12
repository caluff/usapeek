import { randomUUID } from "node:crypto";
import { updateStoresWorkflow } from "@medusajs/core-flows";
import type { MedusaContainer } from "@medusajs/framework/types";
import { MedusaError } from "@medusajs/framework/utils";
import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import {
  updatePaymentReleaseSettingsSchema,
  type UpdatePaymentReleaseSettings,
} from "../lib/order-finance/contracts";
import { withPaymentSettingsLock } from "../lib/order-finance/payment-settings-lock";
import {
  publicPaymentReleaseSettings,
  readPaymentReleaseSettings,
  RELEASE_SETTINGS_METADATA_KEY,
} from "../lib/order-finance/release-settings";
import { requireFinanceOperator } from "../lib/order-finance/settlement-authorization";

type Input = UpdatePaymentReleaseSettings & { actor_id: string };

export async function updatePaymentReleaseSettings(
  container: MedusaContainer,
  input: Input,
) {
  const body = updatePaymentReleaseSettingsSchema.parse({
    mode: input.mode,
    delay_days: input.delay_days,
    expected_revision: input.expected_revision,
  });
  await requireFinanceOperator(container, input.actor_id);
  return withPaymentSettingsLock(container, async () => {
    const current = await readPaymentReleaseSettings(container);
    if (current.revision !== body.expected_revision) {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "La configuración de liberación cambió. Actualiza la página antes de guardar.",
      );
    }
    if (body.mode === "automatic" && !current.automatic_available) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "La liberación automática requiere Stripe TEST configurado y los jobs generales desactivados.",
      );
    }
    if (current.mode === body.mode && current.delay_days === body.delay_days)
      return publicPaymentReleaseSettings(current);
    const settings = {
      mode: body.mode,
      delay_days: body.delay_days,
      revision: randomUUID(),
      actor_id: input.actor_id,
    };
    await updateStoresWorkflow(container).run({
      input: {
        selector: { id: current.store.id },
        update: {
          metadata: {
            ...current.store.metadata,
            [RELEASE_SETTINGS_METADATA_KEY]: settings,
          },
        },
      },
    });
    return publicPaymentReleaseSettings({
      ...settings,
      automatic_available: current.automatic_available,
    });
  });
}

const updatePaymentReleaseSettingsStep = createStep(
  "update-payment-release-settings",
  async (input: Input, { container }) =>
    new StepResponse(await updatePaymentReleaseSettings(container, input)),
);
export const updatePaymentReleaseSettingsWorkflow = createWorkflow(
  "update-payment-release-settings",
  function (input: Input) {
    return new WorkflowResponse(updatePaymentReleaseSettingsStep(input));
  },
);
