import type { Logger, MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import {
  automaticSettlementEnabled,
  MAX_AUTOMATIC_SETTLEMENTS,
} from "../lib/order-finance/automatic-settlement";
import { COMMERCE_AUTOMATION_MODULE } from "../modules/commerce-automation";
import type CommerceAutomationService from "../modules/commerce-automation/service";
import { automaticallySettleOrderFinance } from "./settle-order-finance";

export async function automaticallySettleOrdersBatch(
  container: MedusaContainer,
) {
  const result = { status: "disabled", evaluated: 0, settled: 0, held: 0 };
  if (!(await automaticSettlementEnabled(container))) return result;
  const journal = container.resolve<CommerceAutomationService>(
    COMMERCE_AUTOMATION_MODULE,
  );
  const position = await journal.readAutomaticSettlementScan();
  const candidates = await journal.listDueOrderCompletions({
    position,
    now: new Date(),
    take: MAX_AUTOMATIC_SETTLEMENTS,
  });
  result.status = "evaluated";
  for (const completion of candidates.slice(0, MAX_AUTOMATIC_SETTLEMENTS)) {
    result.evaluated++;
    try {
      await automaticallySettleOrderFinance(container, completion.id);
      result.settled++;
    } catch {
      result.held++;
      container
        .resolve<Logger>(ContainerRegistrationKeys.LOGGER)
        .warn(
          `[automatic-settlement] Order ${completion.id} remains held; inspect its financial report before intervening.`,
        );
    }
  }
  // Advance past blocked orders as well, so one incident cannot starve other sellers.
  await journal.advanceAutomaticSettlementScan(
    position,
    candidates.length
      ? candidates[Math.min(candidates.length, MAX_AUTOMATIC_SETTLEMENTS) - 1]
          .id
      : null,
  );
  return result;
}

const automaticallySettleOrdersStep = createStep(
  "automatically-settle-orders",
  async (_input: Record<string, never>, { container }) => {
    // Provider effects and their durable fences must survive workflow rollback.
    return new StepResponse(await automaticallySettleOrdersBatch(container));
  },
);
export const automaticallySettleOrdersWorkflow = createWorkflow(
  "automatically-settle-orders",
  function (input: Record<string, never>) {
    return new WorkflowResponse(automaticallySettleOrdersStep(input));
  },
);
