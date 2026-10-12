import nativeStripeModule from "@medusajs/medusa/payment-stripe";
import StripeAllocatedPaymentService, { NativeStripeService } from "./service";

export default {
  ...nativeStripeModule,
  services: nativeStripeModule.services.map((service) =>
    service === NativeStripeService ? StripeAllocatedPaymentService : service,
  ),
};
