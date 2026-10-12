import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { Modules } from "@medusajs/framework/utils";
import type { IAuthModuleService } from "@medusajs/framework/types";
import type SellerModule from "@mercurjs/core/modules/seller";
import { MercurModules, type CreateSellerDTO, type UpdateSellerAddressDTO, type UpdateProfessionalDetailsDTO } from "@mercurjs/types";
import { onboardingService, loadApplicant, requireReviewer } from "../../lib/vendor-onboarding/access";
import { validateSubmission } from "../../lib/vendor-onboarding/validation";
import { OnboardingError } from "../../lib/vendor-onboarding/errors";
import { provisionVendorWarehouse } from "./provision-vendor-warehouse";
import { requireSellerWarehouse } from "../../lib/vendor-warehouse/access";

type NativeSellerService = InstanceType<typeof SellerModule.service>;

export const prepareVendorMemberStep = createStep("prepare-vendor-member", async (operationId: string, { container }) => {
  const service = onboardingService(container);
  const { application, mutation } = await service.fenceApproval(operationId, {});
  await requireReviewer(container, mutation.actor_id, "update");
  const live = await loadApplicant(container, application);
  if (!live.emailVerified) throw new OnboardingError("verification_required", 403);
  if (live.email !== application.applicant_email) throw new OnboardingError("identity_changed");
  if (live.memberships.length) throw new OnboardingError("existing_vendor_account");
  if (live.member && !live.member.is_active) throw new OnboardingError("member_inactive", 403);
  const data = await validateSubmission(container, application.submitted_data, live.email);
  const native = container.resolve<NativeSellerService>(MercurModules.SELLER);
  // Pre-journal the deterministic ID; a lost create response is recovered by this ID, never email.
  const memberId = live.member?.id || `mem_${operationId.replace("vappmut_", "")}`;
  await service.fenceApproval(operationId, { member_id: memberId, created_member: !live.member });
  if (!live.member) {
    const existing = (await native.listMembers({ id: memberId }))[0];
    if (existing && (existing.email !== live.email || existing.metadata?.vendor_application_operation !== operationId)) throw new OnboardingError("member_identity_conflict");
    if (!existing) {
      try { await native.createMembers({ id: memberId, email: live.email, first_name: data.responsible.first_name, last_name: data.responsible.last_name, is_active: true, metadata: { vendor_application_operation: operationId } }); }
      catch {
        const recovered = (await native.listMembers({ id: memberId }))[0];
        if (!recovered || recovered.email !== live.email || recovered.metadata?.vendor_application_operation !== operationId) throw new OnboardingError("member_identity_conflict");
      }
    }
  }
  const seller: CreateSellerDTO = { name: data.store.name, handle: data.store.handle, email: live.email, description: data.store.description, website_url: data.store.website_url || null, currency_code: data.activity.currency_code, external_id: `vendor-application:${application.id}` };
  const address: UpdateSellerAddressDTO = { ...data.activity.business_address, first_name: data.responsible.first_name, last_name: data.responsible.last_name, phone: data.responsible.phone };
  const professional_details: UpdateProfessionalDetailsDTO | undefined = data.activity.business_type === "company" ? { corporate_name: data.activity.company_name } : undefined;
  return new StepResponse({ operation_id: operationId, application_id: application.id, customer_id: application.customer_id, auth_identity_id: application.auth_identity_id, member_id: memberId, created_member: !live.member, seller, address, professional_details }, { operation_id: operationId, member_id: memberId, created_member: !live.member });
}, async (input, { container }) => {
  if (!input?.created_member) return;
  const native = container.resolve<NativeSellerService>(MercurModules.SELLER);
  const memberships = await native.listSellerMembers({ member_id: input.member_id });
  if (memberships.length) throw new OnboardingError("approval_recovery_required");
  const member = (await native.listMembers({ id: input.member_id }))[0];
  if (member?.metadata?.vendor_application_operation !== input.operation_id) return;
  const service = onboardingService(container);
  const mutation = await service.retrieveVendorApplicationMutation(input.operation_id);
  const application = await service.retrieveVendorApplication(mutation.application_id);
  if (!mutation.created_member || mutation.member_id !== input.member_id || mutation.state !== "processing" || application.approval_operation_id !== input.operation_id || application.customer_id !== mutation.customer_id || application.status === "approved") throw new OnboardingError("approval_recovery_required");
  const identity = await container.resolve<IAuthModuleService>(Modules.AUTH).retrieveAuthIdentity(application.auth_identity_id);
  // Medusa continues other compensations after a failure; never delete an actor still bound to this identity.
  if (identity.app_metadata?.customer_id !== application.customer_id || identity.app_metadata?.member_id === input.member_id) throw new OnboardingError("approval_recovery_required");
  await native.deleteMembers(input.member_id);
});

export const journalVendorSellerStep = createStep("journal-vendor-seller", async (input: { operation_id: string; seller_id: string }, { container }) => {
  const service = onboardingService(container);
  const { application } = await service.fenceApproval(input.operation_id, { seller_id: input.seller_id });
  await provisionVendorWarehouse(container, { ...input, application_id: application.id });
  const [claim] = await service.listVendorWarehouses({ seller_id: input.seller_id });
  await service.fenceApproval(input.operation_id, { warehouse_id: claim.id, warehouse_ready: true });
  return new StepResponse(input);
});

export const bindVendorIdentityStep = createStep("bind-vendor-identity", async (input: { operation_id: string; member_id: string; auth_identity_id: string; created_member: boolean; seller_id: string }, { container }) => {
  const { application, mutation } = await onboardingService(container).fenceApproval(input.operation_id, {});
  const live = await loadApplicant(container, application);
  if (!live.emailVerified || live.email !== application.applicant_email || mutation.member_id !== input.member_id || mutation.seller_id !== input.seller_id) throw new OnboardingError("identity_changed");
  await requireReviewer(container, mutation.actor_id, "update");
  const service = container.resolve<IAuthModuleService>(Modules.AUTH);
  if (input.created_member) {
    const boundId = live.identity.app_metadata?.member_id;
    if (boundId != null && (boundId !== input.member_id || live.member?.metadata?.vendor_application_operation !== input.operation_id)) throw new OnboardingError("member_identity_conflict");
    if (boundId == null) {
      try { await service.updateAuthIdentities({ id: input.auth_identity_id, app_metadata: { ...live.identity.app_metadata, member_id: input.member_id } }); }
      catch {
        const recovered = await service.retrieveAuthIdentity(input.auth_identity_id);
        if (recovered.app_metadata?.member_id !== input.member_id || recovered.app_metadata.customer_id !== application.customer_id) throw new OnboardingError("approval_recovery_required");
      }
    }
  } else if (live.member?.id !== input.member_id || !live.member.is_active) throw new OnboardingError("member_identity_conflict");
  return new StepResponse(input, input.created_member ? input : null);
}, async (input, { container }) => {
  if (!input) return;
  const onboarding = onboardingService(container);
  const mutation = await onboarding.retrieveVendorApplicationMutation(input.operation_id);
  const application = await onboarding.retrieveVendorApplication(mutation.application_id);
  if (!mutation.created_member || mutation.member_id !== input.member_id || mutation.state !== "processing" || application.approval_operation_id !== input.operation_id || application.auth_identity_id !== input.auth_identity_id || application.customer_id !== mutation.customer_id || application.status === "approved") throw new OnboardingError("approval_recovery_required");
  const service = container.resolve<IAuthModuleService>(Modules.AUTH);
  const identity = await service.retrieveAuthIdentity(input.auth_identity_id);
  if (identity.app_metadata?.customer_id !== application.customer_id) throw new OnboardingError("approval_recovery_required");
  // Native setAuthAppMetadataStep compensation deletes unconditionally; preserve a concurrently replaced key.
  if (identity.app_metadata?.member_id !== input.member_id) return;
  // Native JSON updates merge properties. Null explicitly removes the actor association.
  const metadata = { ...identity.app_metadata, member_id: null };
  try { await service.updateAuthIdentities({ id: identity.id, app_metadata: metadata }); }
  catch { /* A lost write response is accepted only after the readback below. */ }
  const current = await service.retrieveAuthIdentity(identity.id);
  if (current.app_metadata?.member_id === input.member_id || current.app_metadata?.customer_id !== application.customer_id) throw new OnboardingError("approval_recovery_required");
});

export const finalizeVendorApprovalStep = createStep("finalize-vendor-approval", async (input: { operation_id: string }, { container }) => {
  const service = onboardingService(container);
  const claimed = await service.fenceApproval(input.operation_id, {});
  if (!claimed.mutation.seller_id || !claimed.mutation.warehouse_id || !claimed.mutation.warehouse_ready) throw new OnboardingError("approval_recovery_required");
  await requireSellerWarehouse(container, claimed.mutation.seller_id);
  const live = await loadApplicant(container, claimed.application);
  await requireReviewer(container, claimed.mutation.actor_id, "update");
  if (!live.emailVerified || live.email !== claimed.application.applicant_email || !live.member || live.member.id !== claimed.mutation.member_id || !live.member.is_active || !live.memberships.some(membership => membership.seller_id === claimed.mutation.seller_id && membership.is_owner)) throw new OnboardingError("identity_changed");
  try { await service.fenceApproval(input.operation_id, { complete: true }); }
  catch (error) {
    let committed: boolean;
    try {
      const mutation = await service.retrieveVendorApplicationMutation(input.operation_id);
      const application = await service.retrieveVendorApplication(mutation.application_id);
      committed = mutation.state === "complete" && application.status === "approved" && application.approval_operation_id === mutation.id;
    } catch {
      // An unavailable database cannot prove whether COMMIT happened. Keep native resources fenced for recovery.
      return new StepResponse({ completed: false });
    }
    if (!committed) throw error;
  }
  return new StepResponse({ completed: true });
});
