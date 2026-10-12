import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { z } from "@medusajs/framework/zod";
import { parseISO } from "date-fns/parseISO";
import { isValid } from "date-fns/isValid";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import {
  automaticReleaseAvailable,
  readPaymentReleaseSettings,
} from "../lib/order-finance/release-settings";
import { withPaymentSettingsLock } from "../lib/order-finance/payment-settings-lock";
import { COMMERCE_AUTOMATION_MODULE } from "../modules/commerce-automation";
import type CommerceAutomationService from "../modules/commerce-automation/service";
import type { MedusaContainer } from "@medusajs/framework/types";

const inputSchema = z
  .object({ order_ids: z.array(z.string().startsWith("order_")) })
  .strict();
export type RecordOrderCompletionsInput = z.infer<typeof inputSchema>;

export async function recordOrderCompletions(
  container: MedusaContainer,
  input: RecordOrderCompletionsInput,
) {
  if (!automaticReleaseAvailable()) return [];
  const parsed = inputSchema.parse(input);
  const ids = [...new Set(parsed.order_ids)];
  if (!ids.length) return [];
  const { data: orders } = await container
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph(
      {
        entity: "order",
        fields: ["id", "status", "updated_at"],
        filters: { id: ids },
      },
      { cache: { enable: false } },
    );
  if (
    orders.some((order) => !ids.includes(order.id)) ||
    new Set(orders.map((order) => order.id)).size !== orders.length
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Completion observation returned ambiguous order identities.",
    );
  }
  const completedOrders = z
    .array(
      z.object({
        id: z.string().startsWith("order_"),
        updated_at: z
          .union([z.date(), z.iso.datetime({ offset: true })])
          .transform((value) =>
            typeof value === "string" ? parseISO(value) : value,
          )
          .refine(isValid),
      }),
    )
    .parse(orders.filter((order) => order.status === "completed"));
  if (!completedOrders.length) return [];
  const receipts = await withPaymentSettingsLock(container, async () => {
    const settings = await readPaymentReleaseSettings(container);
    return container
      .resolve<CommerceAutomationService>(COMMERCE_AUTOMATION_MODULE)
      .recordOrderCompletions(
        completedOrders.map((order) => ({
          id: order.id,
          observed_order_updated_at: order.updated_at.toISOString(),
          release_delay_days: settings.delay_days,
        })),
      );
  });
  // Persist the server observation independently of event delivery retries.
  // The native update proof holds this clock if the order changes afterwards.
  return receipts;
}

const recordOrderCompletionsStep = createStep(
  "record-order-completions",
  async (input: RecordOrderCompletionsInput, { container }) =>
    new StepResponse(await recordOrderCompletions(container, input)),
);

export const recordOrderCompletionsWorkflow = createWorkflow(
  "record-order-completions",
  function (input: RecordOrderCompletionsInput) {
    return new WorkflowResponse(recordOrderCompletionsStep(input));
  },
);
