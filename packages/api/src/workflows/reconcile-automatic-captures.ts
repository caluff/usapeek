import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { z } from "@medusajs/framework/zod";
import { COMMERCE_AUTOMATION_MODULE } from "../modules/commerce-automation";
import type CommerceAutomationService from "../modules/commerce-automation/service";
import { readPaymentCaptureSettings } from "../lib/order-finance/capture-settings";
import { capturePreparedPurchase } from "../lib/order-finance/automatic-capture";

const SCAN_ID = "automatic-payment-capture";
const BATCH_SIZE = 25;
const groupSchema = z.object({
  id: z.string(),
  orders: z.array(z.object({ id: z.string(), status: z.string() })),
});

export async function reconcileAutomaticCaptures(container: MedusaContainer) {
  if ((await readPaymentCaptureSettings(container)).mode !== "automatic")
    return;
  const journal = container.resolve<CommerceAutomationService>(
    COMMERCE_AUTOMATION_MODULE,
  );
  const [scan] = await journal.listCommerceScans({ id: SCAN_ID }, { take: 1 });
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph(
    {
      entity: "order_group",
      fields: ["id", "orders.id", "orders.status"],
      filters: scan?.position ? { id: { $gt: scan.position } } : {},
      pagination: { take: BATCH_SIZE, order: { id: "ASC" } },
    },
    { cache: { enable: false } },
  );
  const groups = data.slice(0, BATCH_SIZE);
  const states = groups.length
    ? await journal.listCommerceGroupStates(
        { id: groups.map((group) => group.id) },
        { take: BATCH_SIZE },
      )
    : [];
  const statesById = new Map(states.map((state) => [state.id, state]));
  for (const group of groups) {
    const state = statesById.get(group.id);
    if (
      state?.active_token ||
      state?.review_required ||
      state?.observation?.finance_final_capture
    )
      continue;
    try {
      const parsed = groupSchema.parse(group);
      const order = parsed.orders.find((entry) => entry.status !== "canceled");
      if (order) await capturePreparedPurchase(container, order.id);
    } catch {
      container
        .resolve(ContainerRegistrationKeys.LOGGER)
        .warn(
          `[automatic-capture] Compra ${group.id} pendiente de cobro o revisión; se conservan los controles financieros.`,
        );
    }
  }
  // A full sweep is bounded and resumes across runs; blocked early rows cannot
  // starve later purchases. Uncertain financial effects are never retried.
  const next = {
    id: SCAN_ID,
    position:
      groups.length === BATCH_SIZE ? groups[groups.length - 1].id : null,
  };
  if (scan) await journal.updateCommerceScans(next);
  else await journal.createCommerceScans(next);
}

const reconcileAutomaticCapturesStep = createStep(
  "reconcile-automatic-captures",
  async (_input: Record<string, never>, { container }) => {
    await reconcileAutomaticCaptures(container);
    return new StepResponse();
  },
);

export const reconcileAutomaticCapturesWorkflow = createWorkflow(
  "reconcile-automatic-captures",
  function (input: Record<string, never>) {
    return new WorkflowResponse(reconcileAutomaticCapturesStep(input));
  },
);
