import {
  addOrderTransactionStep,
  cancelPaymentStep,
  capturePaymentStep,
  createOrderCreditLinesWorkflow,
  refundPaymentStep,
  updatePaymentCollectionStep,
} from "@medusajs/core-flows";
import type {
  CreateRefundDTO,
  CreateCaptureDTO,
} from "@medusajs/framework/types";
import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";

// Keep irreversible provider work separate from compensatable order bookkeeping.
// A later accounting failure must never rerun money or roll back an earlier refund.
export const refundAllocatedPaymentWorkflow = createWorkflow(
  "refund-allocated-payment",
  function (input: CreateRefundDTO) {
    return new WorkflowResponse(refundPaymentStep(input));
  },
);

const recordFinalAllocatedCaptureWorkflow = createWorkflow(
  "record-final-allocated-capture",
  function (input: CreateCaptureDTO) {
    return new WorkflowResponse(capturePaymentStep(input));
  },
);

export const recordAllocatedRefundWorkflow = createWorkflow(
  "record-allocated-refund",
  function (input: {
    order_id: string;
    amount: number;
    currency_code: string;
    reference_id: string;
    reference: "refund" | "capture";
  }) {
    return new WorkflowResponse(
      addOrderTransactionStep({
        order_id: input.order_id,
        amount: input.amount,
        currency_code: input.currency_code,
        reference_id: input.reference_id,
        reference: input.reference,
      }),
    );
  },
);

export const cancelSharedAuthorizationWorkflow = createWorkflow(
  "cancel-shared-authorization",
  function (input: { payment_id: string }) {
    cancelPaymentStep({ paymentIds: [input.payment_id] });
  },
);

export const closeSharedCollectionWorkflow = createWorkflow(
  "close-shared-collection",
  function (input: { collection_id: string }) {
    updatePaymentCollectionStep({
      selector: { id: input.collection_id },
      update: { status: "canceled" },
    });
  },
);

export const freezeFinalCaptureAllocationWorkflow = createWorkflow(
  "freeze-final-capture-allocation",
  function (input: {
    collection_id: string;
    metadata: Record<string, unknown>;
  }) {
    return new WorkflowResponse(
      updatePaymentCollectionStep({
        selector: { id: input.collection_id },
        update: { metadata: input.metadata },
      }),
    );
  },
);

export { createOrderCreditLinesWorkflow };

export { recordFinalAllocatedCaptureWorkflow as recordFinalCaptureWorkflow };
