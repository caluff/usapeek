import type SellerModule from "@mercurjs/core/modules/seller";
import type { MedusaContainer, IAuthModuleService, IRbacModuleService } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { MercurModules, type SellerMemberDTO } from "@mercurjs/types";
import { z } from "@medusajs/framework/zod";
import type VendorOnboardingService from "../../modules/vendor-onboarding/service";
import { VENDOR_ONBOARDING_MODULE } from "../../modules/vendor-onboarding";
import { OnboardingError } from "./errors";

export type ApplicantIdentity = { customer_id: string; auth_identity_id: string };
export const onboardingService = (container: MedusaContainer) => container.resolve<VendorOnboardingService>(VENDOR_ONBOARDING_MODULE);

const readScopes = new WeakMap<MedusaContainer, Map<string, Promise<unknown>>>();

// Opt in only at read-only HTTP boundaries, never from mutation workflows.
export function enableReadOnlyAccessScope(container: MedusaContainer) {
  if (!readScopes.has(container)) readScopes.set(container, new Map());
}

function accessRead<T>(container: MedusaContainer, key: string, read: () => Promise<T>): Promise<T> {
  const cache = readScopes.get(container);
  if (!cache) return read();
  if (!cache.has(key)) {
    const pending = read();
    cache.set(key, pending);
    void pending.catch(() => { if (cache.get(key) === pending) cache.delete(key); });
  }
  return cache.get(key) as Promise<T>;
}

export function reuseNativeMembershipRead(container: MedusaContainer, memberId: string, sellerId: string, membership?: SellerMemberDTO) {
  const cache = readScopes.get(container);
  if (!cache || !membership || membership.member_id !== memberId || membership.seller_id !== sellerId || membership.member?.id !== memberId || membership.seller?.id !== sellerId) return;
  if (!membership.member.is_active) throw new OnboardingError("member_inactive", 403);
  // Mercur's patched middleware obtains these relations with cache disabled.
  cache.set(JSON.stringify(["membership", memberId, sellerId]), Promise.resolve({ seller: membership.seller, member: membership.member, membership }));
}

export function loadApplicant(container: MedusaContainer, input: ApplicantIdentity) {
  return accessRead(container, JSON.stringify(["applicant", input.customer_id, input.auth_identity_id]), () => readApplicant(container, input));
}

async function readApplicant(container: MedusaContainer, input: ApplicantIdentity) {
  const auth = container.resolve<IAuthModuleService>(Modules.AUTH);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const [identity, { data: customers }] = await Promise.all([
    auth.retrieveAuthIdentity(input.auth_identity_id, { relations: ["provider_identities"] }),
    query.graph({ entity: "customer", fields: ["id", "email", "first_name", "last_name", "has_account"], filters: { id: input.customer_id } }, { cache: { enable: false } }),
  ]);
  if (identity.app_metadata?.customer_id !== input.customer_id) throw new OnboardingError("identity_changed");
  const customer = customers[0];
  const provider = identity.provider_identities?.find((entry) => entry.provider === "emailpass");
  const google = identity.provider_identities?.find((entry) => entry.provider === "google");
  const googleEmail = typeof google?.user_metadata?.email === "string" ? google.user_metadata.email : undefined;
  const email = provider?.entity_id ?? (google?.entity_id ? googleEmail : undefined);
  if (!customer?.has_account || !email || email.toLowerCase() !== customer.email?.toLowerCase()) throw new OnboardingError("identity_changed");
  const memberId = identity.app_metadata?.member_id;
  if (memberId != null && typeof memberId !== "string") throw new OnboardingError("member_identity_conflict");
  const sellerService = container.resolve<NativeSellerService>(MercurModules.SELLER);
  const membershipRead = async () => {
    const member = memberId ? await sellerService.retrieveMember(memberId) : null;
    const memberships = member ? await sellerService.listSellerMembers({ member_id: member.id }) : [];
    return { member, memberships };
  };
  const [verifications, { member, memberships }] = await Promise.all([
    auth.listAuthVerifications({ auth_identity_id: identity.id, entity_type: "email", entity_id: email }),
    membershipRead(),
  ]);
  // Native Google authentication accepts only a signed, verified email claim.
  const googleVerified = !!google?.entity_id && googleEmail?.toLowerCase() === email.toLowerCase();
  const emailVerified = googleVerified || verifications.some((entry) => !!entry.verified_at);
  return { customer, identity, email, emailVerified, member, memberships };
}

export async function requireReviewer(container: MedusaContainer, userId: string, operation: "read" | "update") {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  // Medusa's generated User omits this feature-flagged relation; query the
  // native link entry point and validate its selected identity fields instead.
  const { data }: { data: unknown } = await query.graph({ entity: "user_rbac_role", fields: ["user_id", "rbac_role_id"], filters: { user_id: userId } }, { cache: { enable: false } });
  const links = z.array(z.object({ user_id: z.literal(userId), rbac_role_id: z.string().min(1) })).safeParse(data);
  if (!links.success) throw new OnboardingError("review_forbidden", 403);
  const roles = [...new Set(links.data.map(link => link.rbac_role_id))];
  const rbac = container.resolve<IRbacModuleService>(Modules.RBAC);
  const policies = (await Promise.all(roles.map(id => rbac.listPoliciesForRole(id)))).flat();
  if (!policies.some(policy => ["seller", "*"].includes(policy.resource) && [operation, "*"].includes(policy.operation))) throw new OnboardingError("review_forbidden", 403);
}

export function requireVendorMembership(container: MedusaContainer, memberId: string, sellerId: string) {
  return accessRead(container, JSON.stringify(["membership", memberId, sellerId]), () => readVendorMembership(container, memberId, sellerId));
}

async function readVendorMembership(container: MedusaContainer, memberId: string, sellerId: string) {
  if (!sellerId) throw new OnboardingError("seller_required", 403);
  const sellerService = container.resolve<NativeSellerService>(MercurModules.SELLER);
  const member = await sellerService.retrieveMember(memberId);
  if (!member.is_active) throw new OnboardingError("member_inactive", 403);
  const memberships = await sellerService.listSellerMembers({ member_id: memberId, seller_id: sellerId });
  if (!memberships.length) throw new OnboardingError("seller_membership_required", 403);
  const seller = await sellerService.retrieveSeller(sellerId);
  return { seller, member, membership: memberships[0] };
}

export function requireVendorAccess(container: MedusaContainer, memberId: string, sellerId: string) {
  return accessRead(container, JSON.stringify(["access", memberId, sellerId]), () => readVendorAccess(container, memberId, sellerId));
}

async function readVendorAccess(container: MedusaContainer, memberId: string, sellerId: string) {
  const { seller, member, membership } = await requireVendorMembership(container, memberId, sellerId);
  if (seller.status !== "open") throw new OnboardingError("seller_not_open", 403);
  if (seller.external_id?.startsWith("vendor-application:")) {
    const id = seller.external_id.slice("vendor-application:".length);
    const applications = await onboardingService(container).listVendorApplications({ id, seller_id: seller.id, status: "approved", approval_state: "complete" });
    if (!applications.length) throw new OnboardingError("application_not_approved", 403);
  }
  return { seller, member, membership };
}

type NativeSellerService = InstanceType<typeof SellerModule.service>;
