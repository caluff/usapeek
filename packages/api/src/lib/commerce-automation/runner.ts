import { MedusaError } from "@medusajs/framework/utils";
import type CommerceAutomationService from "../../modules/commerce-automation/service";
import {
  NATIVE_COMMERCE_BOUNDARIES,
  pendingCommerceBoundaries,
} from "./configuration";
import { planCommerceGroup, type CommercePlan } from "./policy";

type Journal = Pick<
  CommerceAutomationService,
  | "claimGroup"
  | "observeGroup"
  | "releaseGroup"
  | "claimOperation"
  | "finishOperation"
>;
export type CommerceRunnerDependencies = {
  journal: Journal;
  readGroup: () => Promise<unknown>;
  cancelOrder: (id: string) => Promise<void>;
  now: () => number;
};

export type CommerceRunResult = {
  status: "busy" | "pending" | "operator_review";
  plan?: CommercePlan;
  pending?: string[];
};

export async function runCommerceGroup(
  dependencies: CommerceRunnerDependencies,
): Promise<CommerceRunResult> {
  const { journal } = dependencies;
  let plan = planCommerceGroup(
    await dependencies.readGroup(),
    dependencies.now(),
  );
  const claim = await journal.claimGroup(plan.groupId, plan.cartId);
  if (!claim?.active_token) return { status: "busy" };
  const token = claim.active_token;
  try {
    // Refresh after durable ownership; the scan's snapshot is never a mutation authorization.
    plan = planCommerceGroup(
      await dependencies.readGroup(),
      dependencies.now(),
    );
    if (plan.groupId !== claim.id || plan.cartId !== claim.cart_id)
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Commerce group identity changed.",
      );
    await journal.observeGroup(
      claim.id,
      token,
      {
        plan,
        held_order_ids: plan.holdOrderIds,
        pending: pendingCommerceBoundaries(),
      },
      plan.holdOrderIds.length > 0,
    );
    const unsafePayment = plan.reasons.some((reason) =>
      [
        "payment_requires_reconciliation",
        "allocation_requires_reconciliation",
      ].includes(reason),
    );
    if (
      NATIVE_COMMERCE_BOUNDARIES.cancellationSerializesAllWriters &&
      !unsafePayment
    ) {
      for (const orderId of plan.cancelOrderIds) {
        const current = planCommerceGroup(
          await dependencies.readGroup(),
          dependencies.now(),
        );
        if (
          current.groupId !== claim.id ||
          current.cartId !== claim.cart_id ||
          !current.cancelOrderIds.includes(orderId) ||
          current.reasons.some((reason) =>
            [
              "payment_requires_reconciliation",
              "allocation_requires_reconciliation",
            ].includes(reason),
          )
        ) {
          throw new MedusaError(
            MedusaError.Types.NOT_ALLOWED,
            "Commerce cancellation eligibility changed.",
          );
        }
        await journal.observeGroup(
          claim.id,
          token,
          { held_order_ids: current.holdOrderIds },
          current.holdOrderIds.length > 0,
        );
        const operation = await journal.claimOperation({
          groupId: claim.id,
          token,
          kind: "cancel",
          targetId: orderId,
        });
        if (!operation)
          throw new MedusaError(
            MedusaError.Types.NOT_ALLOWED,
            "Commerce cancellation requires reconciliation.",
          );
        try {
          await dependencies.cancelOrder(orderId);
          await journal.finishOperation(operation.id, token, "complete", {
            order_id: orderId,
          });
        } catch {
          await journal.finishOperation(operation.id, token, "uncertain", {
            reason: "native_cancellation_outcome_uncertain",
          });
          throw new MedusaError(
            MedusaError.Types.NOT_ALLOWED,
            "Commerce cancellation outcome is uncertain.",
          );
        }
      }
    }
    // Installed native capture is unsafe for reduced totals and webhook/order bookkeeping.
    // There is intentionally no money call here until that integration is implemented and verified.
    const pending = [
      ...pendingCommerceBoundaries(),
      "native_final_capture_and_payout_integration_pending",
    ];
    const requiresReview =
      claim.review_required || plan.holdOrderIds.length > 0 || unsafePayment;
    await journal.observeGroup(
      claim.id,
      token,
      { plan, pending },
      requiresReview,
    );
    await journal.releaseGroup(claim.id, token);
    return {
      status: requiresReview ? "operator_review" : "pending",
      plan,
      pending,
    };
  } catch (error) {
    // Preserve active_token even if recording this diagnostic also fails. No auto lease recovery.
    await journal.observeGroup(
      claim.id,
      token,
      { reason: "commerce_processing_requires_reconciliation" },
      true,
    );
    throw error;
  }
}
