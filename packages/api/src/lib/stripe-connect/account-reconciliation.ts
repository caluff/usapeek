import type Stripe from "stripe";
import { createStripeClient } from "../stripe-client";
import { randomUUID } from "node:crypto";
import type { MedusaContainer } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils";
import type PayoutModule from "@mercurjs/core/modules/payout";
import {
  MercurModules,
  PayoutAccountStatus,
  SellerRole,
} from "@mercurjs/types";
import type { PayoutAccountDTO } from "@mercurjs/types";
import { getStripeConnectConfiguration } from "../stripe-connect-configuration";
import { requireVendorAccess } from "../vendor-onboarding/access";

export type StripeAccountVendor = {
  member_id: string;
  auth_identity_id: string;
  seller_id: string;
};

export type StripeAccountSummary = Pick<PayoutAccountDTO, "id" | "status">;

const unavailable = () =>
  new MedusaError(
    MedusaError.Types.NOT_ALLOWED,
    "Stripe account access is not available.",
  );

export async function requireStripeAccountVendor(
  container: MedusaContainer,
  vendor: StripeAccountVendor,
) {
  const identity = await container
    .resolve(Modules.AUTH)
    .retrieveAuthIdentity(vendor.auth_identity_id);
  if (
    !vendor.member_id ||
    identity.app_metadata?.member_id !== vendor.member_id
  )
    throw unavailable();
  const { membership } = await requireVendorAccess(
    container,
    vendor.member_id,
    vendor.seller_id,
  );
  const policies = await container
    .resolve(Modules.RBAC)
    .listPoliciesForRole(
      membership.role_id || SellerRole.SELLER_ADMINISTRATION,
    );
  if (
    !policies.some(
      (policy) =>
        ["payout_account", "*"].includes(policy.resource) &&
        ["update", "*"].includes(policy.operation),
    )
  )
    throw unavailable();
}

async function accountLinks(
  container: MedusaContainer,
  filters: { seller_id?: string; payout_account_id?: string },
) {
  const { data } = await container
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph(
      {
        entity: "seller_payout_account",
        fields: ["seller_id", "payout_account_id"],
        filters,
      },
      { cache: { enable: false } },
    );
  if (data.length !== 1 || !data[0].seller_id || !data[0].payout_account_id)
    throw unavailable();
  return data[0];
}

export async function resolveVendorStripeAccount(
  container: MedusaContainer,
  vendor: StripeAccountVendor,
) {
  await requireStripeAccountVendor(container, vendor);
  const link = await accountLinks(container, { seller_id: vendor.seller_id });
  return link.payout_account_id;
}

/**
 * Mercur 2.3.3 exposes this mapping only inside its signed-webhook handler, not
 * a public account-refresh API. Keep the offline parity test against that public
 * handler until Mercur exposes a reusable mapper; never forge a webhook to refresh.
 */
export function stripeAccountStatus(
  account: Stripe.Account,
  validation: NonNullable<
    ReturnType<typeof getStripeConnectConfiguration>
  >["accountValidation"] = {},
): PayoutAccountStatus {
  const requirements = account.requirements;
  if (requirements?.disabled_reason?.startsWith("rejected."))
    return PayoutAccountStatus.REJECTED;
  const outstanding = Boolean(
    requirements?.currently_due?.length ||
    requirements?.past_due?.length ||
    requirements?.pending_verification?.length,
  );
  const inactiveCapabilities = (validation?.requiredCapabilities ?? []).some(
    (capability) =>
      account.capabilities?.[
        capability as keyof Stripe.Account.Capabilities
      ] !== "active",
  );
  if (
    (validation?.detailsSubmitted === false ||
      account.details_submitted === true) &&
    (validation?.chargesEnabled === false ||
      account.charges_enabled === true) &&
    (validation?.payoutsEnabled === false ||
      account.payouts_enabled === true) &&
    (validation?.noOutstandingRequirements === false || !outstanding) &&
    !inactiveCapabilities
  )
    return PayoutAccountStatus.ACTIVE;
  return PayoutAccountStatus.RESTRICTED;
}

export function assertStripeAccountBinding(
  account: Stripe.Account,
  local: Pick<PayoutAccountDTO, "id" | "data">,
) {
  if (
    account.id !== local.data.id ||
    account.type !== "express" ||
    account.country !== "US" ||
    account.metadata?.account_id !== local.id ||
    ("deleted" in account && account.deleted) ||
    ("livemode" in account && account.livemode !== false)
  )
    throw unavailable();
}

/** Called only from workflow steps; the webhook uses this same lock and fresh lookup. */
export async function reconcileStripeAccount(
  container: MedusaContainer,
  input: { payout_account_id: string; vendor?: StripeAccountVendor },
): Promise<StripeAccountSummary> {
  const configuration = getStripeConnectConfiguration();
  if (!configuration || !/^sk_test_[A-Za-z0-9]+$/.test(configuration.apiKey))
    throw unavailable();
  if (!/^pacc_[A-Za-z0-9]+$/.test(input.payout_account_id)) throw unavailable();
  const payout = container.resolve<InstanceType<typeof PayoutModule.service>>(
    MercurModules.PAYOUT,
  );
  const locking = container.resolve(Modules.LOCKING);
  const lockKey = `payout-account-status/${input.payout_account_id}`;
  const ownerId = randomUUID();
  // Redis execute() expires its lease while the callback can still be running.
  // Keep exclusion through slow writes; crash recovery must verify the owner is gone.
  await locking.acquire(lockKey, { ownerId });
  try {
    if (
      input.vendor &&
      (await resolveVendorStripeAccount(container, input.vendor)) !==
        input.payout_account_id
    )
      throw unavailable();
    const link = await accountLinks(container, {
      payout_account_id: input.payout_account_id,
    });
    const sellerLink = await accountLinks(container, {
      seller_id: link.seller_id,
    });
    if (sellerLink.payout_account_id !== input.payout_account_id)
      throw unavailable();
    if (input.vendor && link.seller_id !== input.vendor.seller_id)
      throw unavailable();
    const local = await payout.retrievePayoutAccount(input.payout_account_id);
    const stripeId = local.data?.id;
    if (typeof stripeId !== "string" || !/^acct_[A-Za-z0-9]+$/.test(stripeId))
      throw unavailable();
    const stripe = createStripeClient(configuration.apiKey, {
      timeout: 10000,
      maxNetworkRetries: 0,
    });
    let account: Stripe.Account;
    try {
      account = await stripe.accounts.retrieve(stripeId);
    } catch {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "Stripe account verification could not be completed. Try again manually.",
      );
    }
    assertStripeAccountBinding(account, local);
    const status = stripeAccountStatus(
      account,
      configuration.accountValidation,
    );
    // Recheck live access and link identity after the remote request, before committing.
    if (
      input.vendor &&
      (await resolveVendorStripeAccount(container, input.vendor)) !==
        input.payout_account_id
    )
      throw unavailable();
    const currentLink = await accountLinks(container, {
      payout_account_id: input.payout_account_id,
    });
    const currentSellerLink = await accountLinks(container, {
      seller_id: link.seller_id,
    });
    const current = await payout.retrievePayoutAccount(input.payout_account_id);
    if (
      currentLink.seller_id !== link.seller_id ||
      currentSellerLink.payout_account_id !== input.payout_account_id ||
      current.data?.id !== stripeId
    )
      throw unavailable();
    assertStripeAccountBinding(account, current);
    // The native webhook workflow compensates to the previous status. A fresh
    // provider observation must not roll back to stale readiness after failure.
    if (current.status !== status)
      await payout.updatePayoutAccounts({ id: current.id, status });
    return { id: current.id, status };
  } finally {
    await locking.release(lockKey, { ownerId });
  }
}
