import { randomUUID } from "node:crypto";
import type { AuthContext } from "@medusajs/framework/http";
import type { IAuthModuleService, MedusaContainer } from "@medusajs/framework/types";
import { ChangeActionType, ContainerRegistrationKeys, MedusaError, Modules, OrderChangeStatus } from "@medusajs/framework/utils";
import { assertTrackingRecipient, invalidOrderTrackingLink, verifyOrderTrackingToken } from "./access";

export type PreparedOrderTrackingClaim = ReturnType<typeof prepareOrderTrackingClaim>;
export type AuthorizedOrderTrackingClaim = Awaited<ReturnType<typeof authorizeOrderTrackingClaim>>;

function unauthorized(): never {
  throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Inicia sesión con Google para asociar este pedido a tu cuenta.");
}

function unavailable(code: string): never {
  throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "No pudimos asociar este pedido a tu cuenta.", code);
}

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function prepareOrderTrackingClaim(token: string, context: AuthContext) {
  if (context.actor_type !== "customer" || !context.actor_id || !context.auth_identity_id || context.auth_provider !== "google") unauthorized();
  return { claims: verifyOrderTrackingToken(token), context };
}

export async function resolveOrderTrackingClaimLock(container: MedusaContainer, input: PreparedOrderTrackingClaim) {
  const { data: links } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order_cart", fields: ["cart_id"], filters: { order_id: input.claims.order_id },
  }, { cache: { enable: false } });
  if (links.length > 1 || (links[0] && !links[0].cart_id)) unavailable("order_tracking_claim_receipt_changed");
  const cartId = links[0]?.cart_id;
  return { order_id: input.claims.order_id, cart_keys: cartId ? [cartId] : [], owner_id: randomUUID() };
}

export async function authorizeOrderTrackingClaim(container: MedusaContainer, input: PreparedOrderTrackingClaim) {
  const { claims, context } = input;
  if (claims.exp <= Math.floor(Date.now() / 1000)) invalidOrderTrackingLink();
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const [identity, { data: [customer] }] = await Promise.all([
    container.resolve<IAuthModuleService>(Modules.AUTH).retrieveAuthIdentity(context.auth_identity_id, { relations: ["provider_identities"] }),
    query.graph({
      entity: "customer", fields: ["id", "email", "has_account"], filters: { id: context.actor_id },
    }, { cache: { enable: false } }),
  ]);
  const provider = identity.provider_identities?.find((entry) => entry.provider === "google");
  const email = normalizeEmail(provider?.user_metadata?.email);
  // The installed Google provider verifies email_verified before storing this
  // profile. Bind it to the live customer; JWT metadata alone cannot claim orders.
  if (!provider?.entity_id || !email || !customer?.has_account
    || identity.app_metadata?.customer_id !== context.actor_id
    || customer.id !== context.actor_id || normalizeEmail(customer.email) !== email) unauthorized();
  assertTrackingRecipient(claims.recipient, email);

  const { data: [order] } = await query.graph({
    entity: "order",
    fields: ["id", "email", "customer_id", "is_draft_order", "status", "customer.id", "customer.has_account"],
    filters: { id: claims.order_id },
  }, { cache: { enable: false } });
  if (!order || order.is_draft_order) invalidOrderTrackingLink();
  assertTrackingRecipient(claims.recipient, order.email);
  const alreadyOwned = order.customer_id === customer.id;
  if (!alreadyOwned && order.customer_id && (order.customer?.id !== order.customer_id || order.customer.has_account !== false)) unavailable("order_tracking_claim_owner_unavailable");
  // Native transfer rejects canceled orders. An existing association stays
  // idempotent even if that order was canceled after an earlier successful claim.
  if (!alreadyOwned && order.status === "canceled") unavailable("order_tracking_claim_canceled");
  return {
    order_id: order.id, customer_id: customer.id, already_owned: alreadyOwned,
    source_customer_id: order.customer_id ?? null, recipient: claims.recipient,
  };
}

export async function readOrderTrackingTransferToken(container: MedusaContainer, claim: AuthorizedOrderTrackingClaim) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: [order] } = await query.graph({
    entity: "order",
    fields: ["id", "email", "customer_id", "is_draft_order", "status", "customer.id", "customer.has_account"],
    filters: { id: claim.order_id },
  }, { cache: { enable: false } });
  // Recheck the persisted owner before accepting. Marketplace admin/vendor HTTP
  // writers share our cart lock; the order lock also serializes storefront claims.
  if (!order || order.is_draft_order || order.status === "canceled"
    || claim.already_owned || (order.customer_id ?? null) !== claim.source_customer_id
    || (order.customer_id && (order.customer?.id !== order.customer_id || order.customer.has_account !== false))) unavailable("order_tracking_claim_source_changed");
  assertTrackingRecipient(claim.recipient, order.email);
  const { data: changes } = await query.graph({
    entity: "order_change",
    fields: ["id", "change_type", "created_by", "actions.action", "actions.reference_id", "actions.details"],
    filters: { order_id: claim.order_id, status: [OrderChangeStatus.REQUESTED] },
  }, { cache: { enable: false } });
  const change = changes[0];
  const actions = change?.actions?.filter((action) => action && String(action.action) === ChangeActionType.TRANSFER_CUSTOMER);
  const action = actions?.[0];
  if (changes.length !== 1 || change.change_type !== "transfer" || change.created_by !== claim.customer_id
    || actions?.length !== 1 || action?.reference_id !== claim.customer_id
    || typeof action.details?.token !== "string" || !action.details.token) unavailable("order_tracking_claim_transfer_changed");
  return action.details.token;
}
