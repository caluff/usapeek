import type { AdditionalData, CreateCartWorkflowInputDTO, UpdateCartWorkflowInputDTO } from "@medusajs/framework/types";
import { createHash, randomUUID } from "node:crypto";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { createStep, createWorkflow, StepResponse, transform, when, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { acquireLockStep, createCartWorkflow, releaseLockStep, transferCartCustomerWorkflow, updateCartWorkflow, updateCartsStep, useQueryGraphStep } from "@medusajs/medusa/core-flows";
import { validateCartOwnershipWorkflow } from "./validate-cart-ownership";

export const acquireStoreCartIdentityWorkflow = createWorkflow(
  "acquire-store-cart-identity",
  function (input: { key: string; owner_id: string }) {
    // Reuse Medusa's bounded acquisition retries, without a lease expiration.
    acquireLockStep({ key: input.key, ownerId: input.owner_id, timeout: 5, executeOnSubWorkflow: true });
    return new WorkflowResponse(void 0);
  },
);

function guestCustomerLockKey(input: { customer_id?: string | null; email?: string | null }): string | string[] {
  if (!input.email) return [];
  return `guest-cart-customer:${createHash("sha256").update(input.email.trim().toLowerCase()).digest("hex")}`;
}

// Native findOrCreateCustomer searches registered customers when no customer id
// exists. Supplying a guest id keeps its pricing/profile context anonymous,
// including when a registered customer happens to use the same email address.
export const resolveGuestCartCustomerStep = createStep(
  "resolve-guest-cart-customer",
  async (input: { customer_id?: string | null; email?: string | null }, { container }) => {
    if (input.customer_id || !input.email) return new StepResponse(input.customer_id ?? undefined);
    const customers = container.resolve(Modules.CUSTOMER);
    const email = input.email.trim().toLowerCase();
    const [existing] = await customers.listCustomers({ email, has_account: false }, { select: ["id"] });
    if (existing) return new StepResponse(existing.id);
    const customer = await customers.createCustomers({ email, has_account: false });
    return new StepResponse(customer.id, customer.id);
  },
  async (createdCustomerId, { container }) => {
    if (!createdCustomerId) return;
    const { data: carts } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
      entity: "cart", fields: ["id"], filters: { customer_id: createdCustomerId }, pagination: { take: 1 },
    }, { cache: { enable: false } });
    if (!carts.length) await container.resolve(Modules.CUSTOMER).deleteCustomers(createdCustomerId);
  },
);

const createStoreCartWithOwnershipWorkflow = createWorkflow(
  "create-store-cart-with-ownership",
  function (input: CreateCartWorkflowInputDTO & AdditionalData) {
    // Medusa's transform resolver reserves { key, value } for internal entries.
    const customerLock = transform(input, (data) => ({ lock_key: guestCustomerLockKey(data), owner_id: randomUUID() }));
    acquireLockStep({ key: customerLock.lock_key, ownerId: customerLock.owner_id, timeout: 2, executeOnSubWorkflow: true });
    const customerId = resolveGuestCartCustomerStep(input);
    const nativeInput = transform({ input, customerId }, ({ input, customerId }) => ({ ...input, customer_id: customerId }));
    const cart = createCartWorkflow.runAsStep({ input: nativeInput });
    releaseLockStep({ key: customerLock.lock_key, ownerId: customerLock.owner_id, executeOnSubWorkflow: true });
    return new WorkflowResponse(cart);
  },
);

type UpdateInput = { cart: UpdateCartWorkflowInputDTO & AdditionalData; customer_id?: string };

const updateStoreCartWithOwnershipWorkflow = createWorkflow(
  "update-store-cart-with-ownership",
  function (input: UpdateInput) {
    acquireLockStep({ key: input.cart.id, timeout: 2, ttl: 10, executeOnSubWorkflow: true });
    validateCartOwnershipWorkflow.runAsStep({ input: {
      resource: "cart", id: input.cart.id, operation: "update", customer_id: input.customer_id, email: input.cart.email,
    } });
    const { data: carts } = useQueryGraphStep({
      entity: "cart", fields: ["id", "customer_id", "email"], filters: { id: input.cart.id },
      options: { throwIfKeyNotFound: true, cache: { enable: false } },
    });
    const customerInput = transform({ input, carts }, ({ input, carts }) => ({
      customer_id: carts[0].customer_id, email: input.cart.email ?? carts[0].email,
    }));
    const customerLock = transform(customerInput, (data) => ({ lock_key: guestCustomerLockKey(data), owner_id: randomUUID() }));
    acquireLockStep({ key: customerLock.lock_key, ownerId: customerLock.owner_id, timeout: 2, executeOnSubWorkflow: true }).config({ name: "acquire-guest-customer-lock" });
    const customerId = resolveGuestCartCustomerStep(customerInput);
    when("associate-guest-customer", { carts, customerId }, ({ carts, customerId }) => !carts[0].customer_id && !!customerId).then(() => {
      const cartsToUpdate = transform({ carts, customerId }, ({ carts, customerId }) => [{ id: carts[0].id, customer_id: customerId }]);
      updateCartsStep(cartsToUpdate);
    });
    updateCartWorkflow.runAsStep({ input: input.cart });
    releaseLockStep({ key: customerLock.lock_key, ownerId: customerLock.owner_id, executeOnSubWorkflow: true }).config({ name: "release-guest-customer-lock" });
    releaseLockStep({ key: input.cart.id, executeOnSubWorkflow: true });
    return new WorkflowResponse(void 0);
  },
);

// The native transfer reads before acquiring its lock. Recheck the owner while
// holding the cart lock so two authenticated requests cannot adopt the same cart.
const transferStoreCartWithOwnershipWorkflow = createWorkflow(
  "transfer-store-cart-with-ownership",
  function (input: { id: string; customer_id: string } & AdditionalData) {
    acquireLockStep({ key: input.id, timeout: 2, ttl: 10, executeOnSubWorkflow: true });
    validateCartOwnershipWorkflow.runAsStep({ input: {
      resource: "cart", id: input.id, operation: "transfer", customer_id: input.customer_id,
    } });
    transferCartCustomerWorkflow.runAsStep({ input });
    releaseLockStep({ key: input.id, executeOnSubWorkflow: true });
    return new WorkflowResponse(void 0);
  },
);

export {
  createStoreCartWithOwnershipWorkflow as createStoreCartWorkflow,
  updateStoreCartWithOwnershipWorkflow as updateStoreCartWorkflow,
  transferStoreCartWithOwnershipWorkflow as transferStoreCartWorkflow,
};
