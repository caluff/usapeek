import { acquireLockStep, releaseLockStep, emitEventStep } from "@medusajs/core-flows";
import { createWorkflow, WorkflowResponse, when, transform } from "@medusajs/framework/workflows-sdk";
import { createSellerAccountWorkflow, approveSellerWorkflow } from "@mercurjs/core/workflows";
import { applicationLockStep, mutateVendorApplicationStep, type ApplicationMutationInput } from "./steps/mutate-vendor-application";
import { prepareVendorMemberStep, journalVendorSellerStep, bindVendorIdentityStep, finalizeVendorApprovalStep } from "./steps/provision-vendor-application";
import { APPLICATION_NOTIFICATION_EVENT } from "../lib/admin-notifications/events";

export const mutateVendorApplicationWorkflow = createWorkflow(
  { name: "mutate-vendor-application", store: true, retentionTime: 60 * 60 * 24 * 30 },
  function (input: ApplicationMutationInput) {
    const lock = applicationLockStep(input);
    acquireLockStep({ key: lock.key, ownerId: lock.ownerId, timeout: 10, ttl: 120 });
    const mutation = mutateVendorApplicationStep(input);
    const provisioned = when("provision-vendor-application", mutation, (mutation) => mutation.provision).then(() => {
      const prepared = prepareVendorMemberStep(mutation.mutation.id);
      const seller = createSellerAccountWorkflow.runAsStep({ input: { auth_identity_id: prepared.auth_identity_id, member_id: prepared.member_id, seller: prepared.seller, address: prepared.address, professional_details: prepared.professional_details } });
      const journal = journalVendorSellerStep({ operation_id: prepared.operation_id, seller_id: seller.id });
      approveSellerWorkflow.runAsStep({ input: { seller_id: journal.seller_id } });
      const bound = bindVendorIdentityStep({ operation_id: prepared.operation_id, auth_identity_id: prepared.auth_identity_id, member_id: prepared.member_id, created_member: prepared.created_member, seller_id: journal.seller_id });
      releaseLockStep({ key: lock.key, ownerId: lock.ownerId });
      return finalizeVendorApprovalStep({ operation_id: bound.operation_id });
    });
    when("release-unprovisioned-application", mutation, mutation => !mutation.provision).then(() => {
      releaseLockStep({ key: lock.key, ownerId: lock.ownerId }).config({ name: "release-unprovisioned-application-lock" });
    });
    emitEventStep({
      eventName: APPLICATION_NOTIFICATION_EVENT,
      data: transform({ mutation, provisioned }, ({ mutation }) => ({ id: mutation.application.id })),
    });
    return new WorkflowResponse({ application_id: mutation.application.id, processing: transform({ mutation, provisioned }, ({ mutation, provisioned }) => (mutation.replay && mutation.mutation.state === "processing") || provisioned?.completed === false), created: transform({ input, mutation }, ({ input, mutation }) => input.operation === "save" && input.body.expected_version === 0 && !mutation.replay) });
  },
);
