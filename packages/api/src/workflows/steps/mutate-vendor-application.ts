import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { randomUUID } from "node:crypto";
import { onboardingService, loadApplicant, requireReviewer, type ApplicantIdentity } from "../../lib/vendor-onboarding/access";
import { applicationStoreHandle, canonicalHash, TERMS_VERSION, validateSubmission } from "../../lib/vendor-onboarding/validation";
import { SaveApplicationBodySchema, SubmitApplicationBodySchema, ReviewApplicationBodySchema, type SaveApplicationBody, type SubmitApplicationBody, type ReviewApplicationBody } from "../../lib/vendor-onboarding/schemas";
import { OnboardingError } from "../../lib/vendor-onboarding/errors";
import type { ApplicationRecord } from "../../modules/vendor-onboarding/service";
import { reconcileVendorApplication } from "./reconcile-vendor-application";

export type ApplicationMutationInput =
  | { operation: "save"; applicant: ApplicantIdentity; body: SaveApplicationBody }
  | { operation: "submit"; applicant: ApplicantIdentity; body: SubmitApplicationBody }
  | { operation: "review"; application_id: string; reviewer_id: string; body: ReviewApplicationBody };

export const applicationLockStep = createStep("application-lock", async (input: ApplicationMutationInput, { container }) => {
  const app = input.operation === "review" ? await onboardingService(container).retrieveVendorApplication(input.application_id) : null;
  const customerId = app?.customer_id || (input.operation !== "review" ? input.applicant.customer_id : "");
  const identityId = app?.auth_identity_id || (input.operation !== "review" ? input.applicant.auth_identity_id : "");
  const keys = [`vendor-application:${customerId}`, `vendor-identity:${identityId}`];
  if (app?.submitted_data) {
    const data = SaveApplicationBodySchema.shape.data.parse(app.submitted_data);
    keys.push(...[data.store.name, data.store.handle, app.applicant_email].map(value => `vendor-unique:${canonicalHash(value)}`));
  }
  return new StepResponse({ key: keys.sort(), ownerId: randomUUID() });
});

export const mutateVendorApplicationStep = createStep("mutate-vendor-application", async (input: ApplicationMutationInput, { container, transactionId }) => {
  const service = onboardingService(container);
  const isReview = input.operation === "review";
  if (isReview) await requireReviewer(container, input.reviewer_id, "update");
  const current = isReview ? await service.retrieveVendorApplication(input.application_id) : (await service.listVendorApplications({ customer_id: input.applicant.customer_id }))[0];
  const applicant = isReview ? { customer_id: current.customer_id, auth_identity_id: current.auth_identity_id } : input.applicant;
  const live = await loadApplicant(container, applicant);
  const actorId = isReview ? input.reviewer_id : applicant.customer_id;
  const body = input.operation === "save" ? SaveApplicationBodySchema.parse(input.body) : input.operation === "submit" ? SubmitApplicationBodySchema.parse(input.body) : ReviewApplicationBodySchema.parse(input.body);
  const requestHash = canonicalHash({ operation: input.operation, actor_id: actorId, body });
  const previous = (await service.listVendorApplicationMutations({ customer_id: applicant.customer_id, mutation_id: body.mutation_id }))[0];
  if (previous) {
    if (previous.actor_id !== actorId || previous.request_hash !== requestHash || previous.application_id !== current?.id) throw new OnboardingError("mutation_conflict");
    if (previous.state === "failed") throw new OnboardingError(previous.error_code || "approval_failed");
    return new StepResponse({ application: (previous.result || current) as ApplicationRecord, mutation: previous, replay: true, provision: false });
  }
  if (current?.version !== undefined && current.version !== body.expected_version) throw new OnboardingError("version_conflict");
  if (current?.approval_state === "processing") throw new OnboardingError("approval_in_progress");
  if (current && current.auth_identity_id !== applicant.auth_identity_id) throw new OnboardingError("identity_changed");
  if (live.memberships.length) throw new OnboardingError("existing_vendor_account");
  if (live.member && !live.member.is_active) throw new OnboardingError("member_inactive", 403);
  const now = new Date();
  let update: Partial<ApplicationRecord> = {};
  let event: { type: "submitted" | "changes_requested" | "rejected"; reason: string | null; reviewer_id: string | null } | undefined;
  let claim = false;
  if (input.operation === "save") {
    const save = SaveApplicationBodySchema.parse(input.body);
    const persisted = current ? SaveApplicationBodySchema.shape.data.parse(current.data) : null;
    save.data.store.handle = applicationStoreHandle(applicant.customer_id, persisted?.store.handle);
    update = { data: save.data, current_step: save.current_step };
  } else if (input.operation === "submit") {
    if (!current) throw new OnboardingError("application_not_found", 404);
    if (!live.emailVerified) throw new OnboardingError("verification_required", 403);
    const draft = SaveApplicationBodySchema.shape.data.parse(current.data);
    draft.store.handle = applicationStoreHandle(applicant.customer_id, draft.store.handle);
    const data = await validateSubmission(container, draft, live.email, applicant.customer_id);
    update = { data, status: "submitted", submitted_data: data, applicant_email: live.email, submission_revision: current.submission_revision + 1, submitted_at: now, terms_version: TERMS_VERSION, current_step: "review" };
    event = { type: "submitted", reason: null, reviewer_id: null };
  } else {
    const review = ReviewApplicationBodySchema.parse(input.body);
    if (review.decision === "approve") {
      if (!live.emailVerified) throw new OnboardingError("verification_required", 403);
      if (current.applicant_email !== live.email) throw new OnboardingError("identity_changed");
      await validateSubmission(container, current.submitted_data, live.email);
      claim = true;
    } else {
      const status = review.decision === "reject" ? "rejected" : "changes_requested";
      update = { status, reviewed_at: now, review: { decision: review.decision, reason: review.reason, created_at: now.toISOString() } };
      event = { type: status, reason: review.reason, reviewer_id: input.reviewer_id };
    }
  }
  if (!transactionId) throw new OnboardingError("workflow_context_required", 500);
  const result = await service.atomicMutation({ ...applicant, actor_id: actorId, applicant_email: live.email, mutation_id: body.mutation_id, request_hash: requestHash, expected_version: body.expected_version, operation: input.operation, transaction_id: transactionId, application_id: current?.id, allowed_statuses: isReview ? ["submitted"] : ["draft", "changes_requested"], update, event, claim_approval: claim });
  return new StepResponse({ ...result, application: result.application!, provision: claim && !result.replay }, claim && !result.replay ? result.mutation.id : null);
}, async (operationId, { container }) => {
  if (operationId) {
    await reconcileVendorApplication(container, operationId);
    await onboardingService(container).fenceApproval(operationId, { failed: true });
  }
});
