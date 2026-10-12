import {
  DmlEntity,
  MedusaError,
  MedusaServiceModelObjectsSymbol,
} from "@medusajs/framework/utils";
import nativeOrderModule from "@medusajs/medusa/order";

// The public module exposes its exact model objects through Medusa's symbol.
// Keeping their identities also preserves native listeners and joiner metadata.
const nativeModels = Object.fromEntries(
  Object.entries(
    nativeOrderModule.service[MedusaServiceModelObjectsSymbol] as Record<
      string,
      unknown
    >,
  ).map(([name, model]) => {
    if (!DmlEntity.isDmlEntity(model)) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Native Order model ${name} unavailable.`,
      );
    }
    return [name, model] as const;
  }),
);

export const {
  Order,
  OrderAddress,
  OrderLineItem,
  OrderLineItemAdjustment,
  OrderLineItemTaxLine,
  OrderShippingMethod,
  OrderShippingMethodAdjustment,
  OrderShippingMethodTaxLine,
  OrderTransaction,
  OrderChange,
  OrderChangeAction,
  OrderItem,
  OrderSummary,
  OrderShipping,
  ReturnReason,
  Return,
  ReturnItem,
  OrderClaim,
  OrderClaimItem,
  OrderClaimItemImage,
  OrderExchange,
  OrderExchangeItem,
  OrderCreditLine,
} = nativeModels;
