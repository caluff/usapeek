import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import {
  invalidateOrderNotificationScope,
  type InvalidateOrderNotificationsInput,
} from "../lib/vendor-orders/invalidation";

export const invalidateOrderNotificationsStep = createStep(
  "invalidate-order-notifications",
  async (input: InvalidateOrderNotificationsInput, { container }) => {
    await invalidateOrderNotificationScope(container, input);
    // Cache invalidation is safe to repeat and must not be compensated by
    // restoring a stale snapshot when a delivery is retried.
    return new StepResponse(undefined);
  },
);

export const invalidateOrderNotificationsWorkflow = createWorkflow(
  "invalidate-order-notifications",
  function (input: InvalidateOrderNotificationsInput) {
    return new WorkflowResponse(invalidateOrderNotificationsStep(input));
  },
);
