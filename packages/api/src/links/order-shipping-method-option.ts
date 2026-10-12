import { defineLink } from "@medusajs/framework/utils";
import FulfillmentModule from "@medusajs/medusa/fulfillment";
import OrderModule from "@medusajs/medusa/order";

// Resolve the existing option reference without a new relationship table.
export default defineLink(
  {
    linkable: OrderModule.linkable.orderShippingMethod,
    field: "shipping_option_id",
  },
  FulfillmentModule.linkable.shippingOption,
  { readOnly: true },
);
