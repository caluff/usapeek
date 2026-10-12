import {
  completeOrderWorkflow,
  markOrderFulfillmentAsDeliveredWorkflow,
  acquireLockStep,
  releaseLockStep,
} from "@medusajs/core-flows";
import {
  createWorkflow,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import {
  authorizeVendorOrderDeliveryStep,
  readVendorOrderCompletionStep,
  type VendorOrderCompletionInput,
} from "./steps/vendor-order-completion";

export const deliverVendorOrderWorkflow = createWorkflow(
  "deliver-vendor-order",
  function (input: VendorOrderCompletionInput & { fulfillment_id: string }) {
    const authorized = authorizeVendorOrderDeliveryStep(input);
    const delivered = when(
      authorized,
      (authorized) => authorized.should_deliver,
    ).then(() => {
      const deliveryInput = transform(authorized, (authorized) => ({
        orderId: authorized.order_id,
        fulfillmentId: authorized.fulfillment_id,
      }));
      return markOrderFulfillmentAsDeliveredWorkflow.runAsStep({
        input: deliveryInput,
      });
    });
    const lockInput = transform(
      { authorized, delivered },
      ({ authorized }) => ({ key: authorized.order_id, timeout: 2, ttl: 30 }),
    );
    const lock = acquireLockStep(lockInput);
    const readInput = transform(
      { authorized, lock },
      ({ authorized }) => authorized,
    );
    const eligibility = readVendorOrderCompletionStep(readInput);
    const completed = when(
      eligibility,
      (eligibility) => eligibility.can_complete,
    ).then(() =>
      completeOrderWorkflow.runAsStep({
        input: { orderIds: [eligibility.order_id] },
      }),
    );
    const releaseInput = transform(
      { eligibility, completed },
      ({ eligibility }) => ({ key: eligibility.order_id }),
    );
    releaseLockStep(releaseInput);
    return new WorkflowResponse(eligibility);
  },
);
