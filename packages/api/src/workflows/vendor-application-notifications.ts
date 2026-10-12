import { createStep, createWorkflow, StepResponse, WorkflowResponse, transform, when } from "@medusajs/framework/workflows-sdk";
import { requestVerificationStep, requestVerificationWorkflow } from "@medusajs/core-flows";
import { deliverEmailNotification } from "../lib/deliver-email-notification";
import { loadApplicant, onboardingService, type ApplicantIdentity } from "../lib/vendor-onboarding/access";
import { onboardingEmailConfiguration } from "../lib/vendor-onboarding/email";
import { OnboardingError } from "../lib/vendor-onboarding/errors";
import { canonicalHash } from "../lib/vendor-onboarding/validation";
import { ReadNotificationsBodySchema } from "../lib/vendor-onboarding/schemas";
import { isTestEmailVerificationEnabled } from "../lib/vendor-onboarding/verification";

const prepareVerificationStep = createStep("prepare-verification", async (input: { applicant: ApplicantIdentity; ip: string }, { container }) => {
  const live = await loadApplicant(container, input.applicant);
  const testMode = isTestEmailVerificationEnabled();
  if (!testMode && !onboardingEmailConfiguration()) throw new OnboardingError("email_service_unconfigured", 503);
  await onboardingService(container).reserveVerification(live.customer.id, canonicalHash(input.ip));
  return new StepResponse({ testMode, request: { auth_identity_id: live.identity.id, entity_id: live.email, entity_type: "email", code_provider: "token", metadata: { actor_type: "customer", vendor_onboarding: true } } });
});
export const requestVendorApplicationVerificationWorkflow = createWorkflow("request-vendor-application-verification", function (input: { applicant: ApplicantIdentity; ip: string }) {
  const prepared = prepareVerificationStep(input);
  // Reuse the native token generator without dispatching an email in test mode.
  const testVerification = when("test-email-verification", prepared, data => data.testMode).then(() => requestVerificationStep(prepared.request));
  when("email-verification-delivery", prepared, data => !data.testMode).then(() => {
    requestVerificationWorkflow.runAsStep({ input: prepared.request });
  });
  return new WorkflowResponse(transform({ prepared, testVerification }, ({ prepared, testVerification }) => ({
    requested: true as const,
    retry_after_seconds: 60,
    ...(prepared.testMode && testVerification ? { test_code: testVerification.code } : {}),
  })));
});
const readNotificationsStep = createStep("read-notifications", async (input: { applicant: ApplicantIdentity; notification_ids: string[] }, { container }) => {
  await loadApplicant(container, input.applicant);
  const body = ReadNotificationsBodySchema.parse({ notification_ids: input.notification_ids });
  await onboardingService(container).markNotificationsRead(input.applicant.customer_id, body.notification_ids);
  return new StepResponse({ updated: true });
});
export const readVendorApplicationNotificationsWorkflow = createWorkflow("read-vendor-application-notifications", function (input: { applicant: ApplicantIdentity; notification_ids: string[] }) {
  return new WorkflowResponse(readNotificationsStep(input));
});
type NotificationDeliveryResult = {
  configured: boolean;
  status: "disabled" | "empty" | "sent" | "failed";
};
const deliverNotificationStep = createStep("deliver-notification", async (_input: Record<string, never>, { container }): Promise<StepResponse<NotificationDeliveryResult>> => {
  const configuration = onboardingEmailConfiguration();
  if (!configuration) return new StepResponse({ configured: false, status: "disabled" });
  const service = onboardingService(container);
  const event = await service.claimEmailEvent();
  if (!event) return new StepResponse({ configured: true, status: "empty" });
  try {
    const application = await service.retrieveVendorApplication(event.application_id);
    const notification = await deliverEmailNotification(container, { to: application.applicant_email, from: configuration.from, channel: "email", template: `vendor-application-${event.type}`, trigger_type: "vendor-application-status", idempotency_key: event.id, data: { application_id: application.id, status: event.type, reason: event.reason } });
    const status = notification.status === "success" ? "sent" : "failed";
    await service.finishEmailEvent(event.id, event.email_claimed_at!, status);
    return new StepResponse({ configured: true, status });
  } catch {
    await service.finishEmailEvent(event.id, event.email_claimed_at!, "failed");
    return new StepResponse({ configured: true, status: "failed" });
  }
});
export const deliverVendorApplicationNotificationWorkflow = createWorkflow("deliver-vendor-application-notification", function (input: Record<string, never>) {
  return new WorkflowResponse(deliverNotificationStep(input));
});
