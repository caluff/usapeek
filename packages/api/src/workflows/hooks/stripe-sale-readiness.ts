import { completeCartWithSplitOrdersWorkflow } from "@mercurjs/core/workflows";
import { assertCartSellersReadyForSale } from "../../lib/stripe-connect/sale-readiness";
import { assertCartProductsNotPaused } from "../../lib/catalog/sale-pause";
import { validateCartCompletionBuyer } from "../validate-cart-ownership";
import { assertCartShippingStillAvailable } from "../../lib/vendor-shipping/checkout";

// Covers both the native Store API and payment-webhook-driven cart completion.
completeCartWithSplitOrdersWorkflow.hooks.validate(
  async ({ input }, { container }) => {
    await validateCartCompletionBuyer(container, input.cart_id);
    await assertCartShippingStillAvailable(container, input.cart_id);
    await assertCartProductsNotPaused(container, input.cart_id);
    await assertCartSellersReadyForSale(container, input.cart_id);
  },
);
