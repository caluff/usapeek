import type { Logger, MedusaContainer } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { cancelOrderWorkflow } from "@medusajs/core-flows";
import {
  MercurModules,
  PAYOUT_MODULE_OPTION_DEFAULTS,
  type PayoutModuleOptions,
} from "@mercurjs/types";
import { commerceAutomationEnabled } from "../../lib/commerce-automation/configuration";
import { MAX_COMMERCE_GROUPS } from "../../lib/commerce-automation/policy";
import { runCommerceGroup } from "../../lib/commerce-automation/runner";
import { COMMERCE_AUTOMATION_MODULE } from "../../modules/commerce-automation";
import type CommerceAutomationService from "../../modules/commerce-automation/service";

const GROUP_FIELDS = [
  "id",
  "cart_id",
  "created_at",
  "orders.id",
  "orders.created_at",
  "orders.status",
  "orders.currency_code",
  "orders.total",
  "orders.payment_collections.id",
  "orders.cart.id",
  "orders.cart.payment_collection.id",
  "orders.cart.payment_collection.status",
  "orders.cart.payment_collection.amount",
  "orders.cart.payment_collection.payments.id",
  "orders.cart.payment_collection.payments.provider_id",
  "orders.cart.payment_collection.payments.amount",
  "orders.cart.payment_collection.payments.created_at",
  "orders.cart.payment_collection.payments.captured_at",
  "orders.cart.payment_collection.payments.canceled_at",
  "orders.cart.payment_collection.payments.captures.id",
  "orders.cart.payment_collection.payments.captures.amount",
  "orders.cart.payment_collection.payments.refunds.id",
  "orders.cart.payment_collection.payments.refunds.amount",
  "orders.cart.payment_collection.payments.data",
  "orders.seller.id",
  "orders.seller.status",
  "orders.seller.payout_account.id",
  "orders.seller.payout_account.status",
  "orders.seller.payout_account.data",
  "orders.items.id",
  "orders.items.quantity",
  "orders.items.detail.fulfilled_quantity",
  "orders.fulfillments.id",
  "orders.fulfillments.canceled_at",
];

export async function evaluateCommerceBatch(container: MedusaContainer) {
  if (!commerceAutomationEnabled())
    return {
      status: "disabled",
      evaluated: 0,
      pending: 0,
      review: 0,
      busy: 0,
      invalid: 0,
    };
  const payout = container.resolve<{ getOptions(): PayoutModuleOptions }>(
    MercurModules.PAYOUT,
  );
  const options = payout.getOptions();
  if (options.disabled)
    return {
      status: "disabled",
      evaluated: 0,
      pending: 0,
      review: 0,
      busy: 0,
      invalid: 0,
    };
  for (const key of [
    "authorizationWindowMs",
    "sellerActionWindowMs",
    "captureSafetyBufferMs",
    "requiredFulfillmentStatus",
  ] as const) {
    if (
      options[key] !== undefined &&
      options[key] !== PAYOUT_MODULE_OPTION_DEFAULTS[key]
    ) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Commerce automation requires the confirmed native timing and fulfillment defaults.",
      );
    }
  }
  const journal = container.resolve<CommerceAutomationService>(
    COMMERCE_AUTOMATION_MODULE,
  );
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const [cursor] = await journal.listCommerceScans(
    { id: "groups" },
    { take: 1 },
  );
  const position = cursor?.position ?? null;
  const { data: groups } = await query.graph(
    {
      entity: "order_group",
      fields: ["id"],
      filters: position ? { id: { $gt: position } } : {},
      pagination: { take: MAX_COMMERCE_GROUPS, order: { id: "ASC" } },
    },
    { cache: { enable: false } },
  );
  const result = {
    status: "evaluated",
    evaluated: 0,
    pending: 0,
    review: 0,
    busy: 0,
    invalid: 0,
  };
  for (const group of groups.slice(0, MAX_COMMERCE_GROUPS)) {
    try {
      const outcome = await runCommerceGroup({
        journal,
        now: Date.now,
        readGroup: async () => {
          const { data } = await query.graph(
            {
              entity: "order_group",
              fields: GROUP_FIELDS,
              filters: { id: group.id },
            },
            { cache: { enable: false } },
          );
          if (data.length !== 1 || data[0].id !== group.id)
            throw new MedusaError(
              MedusaError.Types.NOT_ALLOWED,
              "Commerce group missing or ambiguous.",
            );
          return data[0];
        },
        cancelOrder: async (orderId) => {
          await cancelOrderWorkflow(container).run({
            input: { order_id: orderId },
          });
        },
      });
      result.evaluated++;
      if (outcome.status === "busy") result.busy++;
      else if (outcome.status === "operator_review") result.review++;
      else result.pending++;
    } catch {
      result.invalid++;
      container
        .resolve<Logger>(ContainerRegistrationKeys.LOGGER)
        .warn(
          `[commerce-automation] Group ${group.id} requires reconciliation; no automatic money retry.`,
        );
    }
  }
  await journal.advanceScan(
    position,
    groups.length
      ? groups[Math.min(groups.length, MAX_COMMERCE_GROUPS) - 1].id
      : null,
  );
  return result;
}

export const evaluateCommerceStep = createStep(
  "evaluate-commerce",
  async (_input: Record<string, never>, { container }) => {
    // Claims and audit observations deliberately have no compensation; uncertainty must survive rollback.
    return new StepResponse(await evaluateCommerceBatch(container));
  },
);
