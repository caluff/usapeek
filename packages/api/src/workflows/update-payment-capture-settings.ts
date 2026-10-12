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
  updatePaymentCaptureSettingsSchema,
  type UpdatePaymentCaptureSettings,
} from "../lib/order-finance/contracts";
import {
  CAPTURE_SETTINGS_METADATA_KEY,
  publicPaymentCaptureSettings,
  readPaymentCaptureSettings,
} from "../lib/order-finance/capture-settings";
import { withPaymentSettingsLock } from "../lib/order-finance/payment-settings-lock";

type Input = UpdatePaymentCaptureSettings & { actor_id: string };
export async function updatePaymentCaptureSettings(
  container: MedusaContainer,
  input: Input,
) {
  const body = updatePaymentCaptureSettingsSchema.parse({
    mode: input.mode,
    expected_revision: input.expected_revision,
  });
  if (!input.actor_id.startsWith("user_")) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Debes iniciar sesión como operador.",
    );
  }
  return withPaymentSettingsLock(container, async () => {
    const current = await readPaymentCaptureSettings(container);
    if (current.revision !== body.expected_revision) {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "El modo de cobro cambió. Actualiza la página antes de guardar.",
      );
    }
    if (current.mode === body.mode)
      return publicPaymentCaptureSettings(current);
    const settings = {
      mode: body.mode,
      revision: randomUUID(),
      actor_id: input.actor_id,
    };
    await updateStoresWorkflow(container).run({
      input: {
        selector: { id: current.store.id },
        update: {
          metadata: {
            ...current.store.metadata,
            [CAPTURE_SETTINGS_METADATA_KEY]: settings,
          },
        },
      },
    });
    return publicPaymentCaptureSettings(settings);
  });
}

export const updatePaymentCaptureSettingsStep = createStep(
  "update-payment-capture-settings",
  async (input: Input, { container }) => {
    return new StepResponse(
      await updatePaymentCaptureSettings(container, input),
    );
  },
);

export const updatePaymentCaptureSettingsWorkflow = createWorkflow(
  "update-payment-capture-settings",
  function (input: Input) {
    return new WorkflowResponse(updatePaymentCaptureSettingsStep(input));
  },
);
