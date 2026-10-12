import { acceptOrderTransferWorkflow, acquireLockStep, releaseLockStep, requestOrderTransferWorkflow } from "@medusajs/core-flows";
import type { AuthContext } from "@medusajs/framework/http";
import { createWorkflow, transform, when, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { StoreOrderTrackingClaimResponseSchema } from "../lib/order-tracking/claim-contracts";
import { authorizeOrderTrackingClaimStep, prepareOrderTrackingClaimStep, readOrderTrackingTransferTokenStep, resolveOrderTrackingClaimLockStep } from "./steps/claim-tracked-order";

export const claimTrackedOrderWorkflow = createWorkflow(
  "claim-tracked-order",
  function (input: { token: string; auth_context: AuthContext }) {
    const prepared = prepareOrderTrackingClaimStep(input);
    const lock = resolveOrderTrackingClaimLockStep(prepared);
    // Cart first matches existing admin/vendor writer locks. Acquiring keys
    // sequentially also avoids leaking a partial multi-key acquisition on failure.
    const acquiredCart = acquireLockStep({ key: lock.cart_keys, ownerId: lock.owner_id, timeout: 5, executeOnSubWorkflow: true });
    const orderLock = transform({ lock, acquiredCart }, ({ lock }) => lock);
    const acquiredOrder = acquireLockStep({ key: orderLock.order_id, ownerId: orderLock.owner_id, timeout: 5, executeOnSubWorkflow: true }).config({ name: "acquire-order-tracking-order-lock" });
    const lockedInput = transform({ prepared, acquiredOrder }, ({ prepared }) => prepared);
    const claim = authorizeOrderTrackingClaimStep(lockedInput);
    const transferred = when("associate-tracked-guest-order", claim, (claim) => !claim.already_owned).then(() => {
      const requested = requestOrderTransferWorkflow.runAsStep({ input: {
        order_id: claim.order_id,
        customer_id: claim.customer_id,
        logged_in_user: claim.customer_id,
        update_order_email: false,
        description: "Asociación del pedido de invitado mediante su enlace privado y Google.",
      } });
      const token = readOrderTrackingTransferTokenStep({ claim, requested });
      return acceptOrderTransferWorkflow.runAsStep({ input: { order_id: claim.order_id, token } });
    });
    const completedLock = transform({ lock, claim, transferred }, ({ lock }) => lock);
    const releasedOrder = releaseLockStep({ key: completedLock.order_id, ownerId: completedLock.owner_id, executeOnSubWorkflow: true });
    const cartLock = transform({ completedLock, releasedOrder }, ({ completedLock }) => completedLock);
    const releasedCart = releaseLockStep({ key: cartLock.cart_keys, ownerId: cartLock.owner_id, executeOnSubWorkflow: true }).config({ name: "release-order-tracking-cart-lock" });
    const response = transform({ claim, releasedCart }, ({ claim }) => StoreOrderTrackingClaimResponseSchema.parse({ status: "associated", order_id: claim.order_id }));
    return new WorkflowResponse(response);
  },
);
