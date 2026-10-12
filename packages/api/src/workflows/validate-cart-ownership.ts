import type { CartDTO, CustomerDTO, MedusaContainer, OrderDTO } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk";

type CartOperation = "read" | "update" | "transfer" | "payment" | "complete";
type Input = { customer_id?: string } & (
  | { resource: "cart"; id: string; operation: CartOperation; email?: string | null }
  | { resource: "payment_collection"; id: string }
  | { resource: "order"; id: string; cart_id?: string }
);
type CustomerOwnership = Pick<CustomerDTO, "id" | "has_account">;
type CartOwnership = Pick<CartDTO, "id" | "customer_id" | "completed_at"> & {
  customer?: CustomerOwnership | null;
};
type OrderOwnership = Pick<OrderDTO, "id" | "customer_id"> & {
  customer?: CustomerOwnership | null;
};

export const STORE_CART_BUYER_CONTEXT = "storeCartBuyerContext";

function notFound(): never {
  throw new MedusaError(MedusaError.Types.NOT_FOUND, "Resource not found.");
}

function isGuest(resource: { customer_id?: string | null; customer?: CustomerOwnership | null }) {
  // A missing linked customer is not evidence that an assigned cart is public.
  return !resource.customer_id || (
    resource.customer?.id === resource.customer_id && resource.customer.has_account === false
  );
}

async function retrieveCart(container: MedusaContainer, id: string): Promise<CartOwnership> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "cart",
    fields: ["id", "customer_id", "completed_at", "customer.id", "customer.has_account"],
    filters: { id },
  }, { cache: { enable: false } });
  const cart = data[0] as CartOwnership | undefined;
  if (!cart) notFound();
  return cart;
}

function validateCart(cart: CartOwnership, customerId: string | undefined, operation: CartOperation) {
  if (!isGuest(cart) && cart.customer_id !== customerId) notFound();

  if (customerId && cart.customer_id !== customerId && (operation === "payment" || operation === "complete")) {
    throw new MedusaError(
      MedusaError.Types.FORBIDDEN,
      "cart_customer_transfer_required: Transfer the guest cart to the authenticated customer before checkout.",
      "cart_customer_transfer_required",
    );
  }

  // Completion itself remains retryable: the native workflow returns the existing order group.
  if (cart.completed_at && operation !== "read" && operation !== "complete") {
    throw new MedusaError(
      MedusaError.Types.FORBIDDEN,
      "A completed cart cannot be changed or transferred.",
      "cart_already_completed",
    );
  }
}

const validateStoreCartOwnershipStep = createStep(
  "validate-store-cart-ownership",
  async (input: Input, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    if (input.resource === "order") {
      const { data } = await query.graph({
        entity: "order",
        fields: ["id", "customer_id", "customer.id", "customer.has_account"],
        filters: { id: input.id },
      }, { cache: { enable: false } });
      const order = data[0] as OrderOwnership | undefined;
      if (!order) notFound();
      if (input.customer_id && order.customer_id === input.customer_id) {
        return new StepResponse({ valid: true });
      }
      if (input.customer_id || !isGuest(order) || !input.cart_id) notFound();

      // An order id alone is never a guest receipt credential. Mercur creates
      // the native order_cart link for every seller order during the split.
      const { data: links } = await query.graph({
        entity: "order_cart",
        fields: ["cart_id", "order_id"],
        filters: { order_id: input.id, cart_id: input.cart_id },
      }, { cache: { enable: false } });
      if (links.length !== 1 || links[0].cart_id !== input.cart_id || links[0].order_id !== input.id) notFound();
      const cart = await retrieveCart(container, input.cart_id);
      if (!isGuest(cart) || cart.customer_id !== order.customer_id || !cart.completed_at) notFound();
      return new StepResponse({ valid: true });
    }

    let cartId = input.id;
    if (input.resource === "payment_collection") {
      const { data: links } = await query.graph({
        entity: "cart_payment_collection",
        fields: ["cart_id"],
        filters: { payment_collection_id: input.id },
      }, { cache: { enable: false } });
      if (links.length !== 1 || !links[0].cart_id) notFound();
      cartId = links[0].cart_id;
    }
    const cart = await retrieveCart(container, cartId);
    validateCart(cart, input.customer_id, input.resource === "cart" ? input.operation : "payment");
    if (input.resource === "cart" && input.operation === "update" && input.email && isGuest(cart)) {
      if (input.customer_id && cart.customer_id !== input.customer_id) {
        throw new MedusaError(
          MedusaError.Types.FORBIDDEN,
          "cart_customer_transfer_required: Transfer the guest cart before updating checkout details.",
          "cart_customer_transfer_required",
        );
      }
    }
    return new StepResponse({ valid: true, cart_id: cart.id });
  },
);

// A preflight preserves native route validators and Mercur's occupied hooks.
const validateStoreCartOwnershipWorkflow = createWorkflow(
  "validate-store-cart-ownership",
  function (input: Input) {
    return new WorkflowResponse(validateStoreCartOwnershipStep(input));
  },
);

// Only the HTTP completion middleware sets this request-scoped context. Trusted
// internal/payment-webhook completion continues using the cart's stored buyer.
export async function validateCartCompletionBuyer(container: MedusaContainer, cartId: string) {
  if (!container.hasRegistration(STORE_CART_BUYER_CONTEXT)) return;
  const context = container.resolve<{ customer_id?: string }>(STORE_CART_BUYER_CONTEXT);
  await validateStoreCartOwnershipWorkflow(container).run({ input: {
    resource: "cart", id: cartId, operation: "complete", customer_id: context.customer_id,
  } });
}

export { validateStoreCartOwnershipWorkflow as validateCartOwnershipWorkflow };
