import {
  acquireLockStep,
  completeOrderWorkflow,
  releaseLockStep,
} from "@medusajs/core-flows";
import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import {
  authorizeVendorOrderStep,
  readVendorOrderCompletionStep,
  type VendorOrderCompletionInput,
} from "./steps/vendor-order-completion";

export const completeVendorOrderWorkflow = createWorkflow(
  "complete-vendor-order",
  function (input: VendorOrderCompletionInput) {
    const authorized = authorizeVendorOrderStep(input);
    const lock = acquireLockStep({
      key: authorized.order_id,
      timeout: 2,
      ttl: 30,
    });
    const readInput = transform({ authorized, lock }, ({ authorized }) => ({
      ...authorized,
      require_ready: true,
    }));
    const ready = readVendorOrderCompletionStep(readInput);
    const completed = completeOrderWorkflow.runAsStep({
      input: { orderIds: [ready.order_id] },
    });
    const releaseInput = transform({ ready, completed }, ({ ready }) => ({
      key: ready.order_id,
    }));
    releaseLockStep(releaseInput);
    return new WorkflowResponse(completed);
  },
);
