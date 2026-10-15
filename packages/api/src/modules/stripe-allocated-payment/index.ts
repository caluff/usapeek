import nativeStripeModule from "@medusajs/medusa/payment-stripe";
import StripeAllocatedPaymentService, { NativeStripeService } from "./service";
import { getStripeMode } from "../../lib/stripe-mode";

export default {
  ...nativeStripeModule,
  // LIVE enables only the provider covered by the manual allocation workflow.
  // Keep legacy TEST provider registrations unchanged for develop compatibility.
  services:
    getStripeMode() === "live"
      ? [StripeAllocatedPaymentService]
      : nativeStripeModule.services.map((service) =>
          service === NativeStripeService
            ? StripeAllocatedPaymentService
            : service,
        ),
};
