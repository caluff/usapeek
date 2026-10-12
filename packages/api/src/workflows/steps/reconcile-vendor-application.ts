import type { MedusaContainer } from "@medusajs/framework/types";
import type SellerModule from "@mercurjs/core/modules/seller";
import { Modules } from "@medusajs/framework/utils";
import { MercurModules } from "@mercurjs/types";
import { onboardingService } from "../../lib/vendor-onboarding/access";
import { DraftDataSchema } from "../../lib/vendor-onboarding/schemas";
import { OnboardingError } from "../../lib/vendor-onboarding/errors";
import { reconcileVendorWarehouse } from "./provision-vendor-warehouse";

// Final compensation also reconciles writes whose database commit succeeded but response was lost.
export async function reconcileVendorApplication(container: MedusaContainer, operationId: string) {
  const service = onboardingService(container);
  const mutation = await service.retrieveVendorApplicationMutation(operationId);
  const application = await service.retrieveVendorApplication(mutation.application_id);
  if (application.approval_operation_id !== operationId || mutation.state !== "processing" || application.version !== mutation.expected_version) throw new OnboardingError("approval_in_progress");
  if (application.status === "approved") throw new OnboardingError("approval_recovery_required");
  await reconcileVendorWarehouse(container, operationId);
  const native = container.resolve<InstanceType<typeof SellerModule.service>>(MercurModules.SELLER);
  const data = DraftDataSchema.parse(application.submitted_data);
  const sellers = await native.listSellers({ external_id: `vendor-application:${application.id}` });
  if (sellers.length > 1) throw new OnboardingError("approval_recovery_required");
  for (const seller of sellers) {
    if ((mutation.seller_id && mutation.seller_id !== seller.id) || seller.name !== data.store.name || seller.handle !== data.store.handle || seller.email !== application.applicant_email || seller.currency_code !== data.activity.currency_code) throw new OnboardingError("approval_recovery_required");
    const memberships = await native.listSellerMembers({ seller_id: seller.id });
    if (memberships.some(membership => membership.member_id !== mutation.member_id || !membership.is_owner)) throw new OnboardingError("approval_recovery_required");
    if (memberships.length) await native.deleteSellerMembers(memberships.map(membership => membership.id));
    await native.deleteSellers(seller.id);
  }
  if (mutation.created_member && mutation.member_id) {
    const auth = container.resolve(Modules.AUTH);
    const identity = await auth.retrieveAuthIdentity(application.auth_identity_id);
    if (identity.app_metadata?.customer_id !== application.customer_id) throw new OnboardingError("approval_recovery_required");
    if (identity.app_metadata.member_id === mutation.member_id) {
      // Native JSON updates merge properties; omission does not remove the actor binding.
      const metadata = { ...identity.app_metadata, member_id: null };
      try { await auth.updateAuthIdentities({ id: identity.id, app_metadata: metadata }); }
      catch { /* Verify a possible committed write with a lost response below. */ }
      const current = await auth.retrieveAuthIdentity(identity.id);
      if (current.app_metadata?.member_id === mutation.member_id || current.app_metadata?.customer_id !== application.customer_id) throw new OnboardingError("approval_recovery_required");
    }
    const member = (await native.listMembers({ id: mutation.member_id }))[0];
    if (member) {
      if (member.metadata?.vendor_application_operation !== operationId || (await native.listSellerMembers({ member_id: member.id })).length) throw new OnboardingError("approval_recovery_required");
      await native.deleteMembers(member.id);
    }
  }
}
