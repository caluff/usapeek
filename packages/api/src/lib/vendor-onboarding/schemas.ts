import { z } from "@medusajs/framework/zod";
import type { HttpTypes } from "@medusajs/framework/types";
import type { SellerDTO } from "@mercurjs/types";

const text = (max: number) => z.string().trim().max(max).refine(
  (value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
  "Control characters are not allowed",
);
const name = (max: number) => text(max).refine(value => !/[\u0000-\u001f\u007f]/.test(value), "Control characters are not allowed");
export const ApplicationStatusSchema = z.enum(["draft", "submitted", "changes_requested", "approved", "rejected"]);
export const ApprovalStateSchema = z.enum(["idle", "processing", "failed", "complete"]);
export const WizardStepSchema = z.enum(["responsible", "store", "activity", "review"]);
export const BusinessAddressSchema = z.strictObject({
  address_1: text(200), address_2: text(200), city: text(100), province: text(100),
  postal_code: text(20), country_code: text(2),
});
export const DraftDataSchema = z.strictObject({
  responsible: z.strictObject({ first_name: name(100), last_name: name(100), phone: text(32) }),
  store: z.strictObject({
    name: name(120), handle: name(80).default(""), description: text(2000),
    website_url: text(2048).refine((value) => {
      if (!value) return true;
      try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; }
      catch { return false; }
    }, "Use an HTTP(S) URL without credentials"),
  }),
  activity: z.strictObject({
    business_type: z.enum(["individual", "company"]), company_name: text(200),
    business_address: BusinessAddressSchema, currency_code: text(3),
    category_ids: z.array(text(100).min(1)).max(10).refine((ids) => new Set(ids).size === ids.length),
    category_suggestion: name(120).optional(),
    description: text(2000),
  }),
});
const MutationSchema = z.strictObject({ mutation_id: z.uuid(), expected_version: z.number().int().min(0) });
export const SaveApplicationBodySchema = MutationSchema.extend({ current_step: WizardStepSchema, data: DraftDataSchema });
export const SubmitApplicationBodySchema = MutationSchema.extend({ accepted_terms: z.literal(true) });
export const ReviewApplicationBodySchema = z.discriminatedUnion("decision", [
  MutationSchema.extend({ decision: z.literal("approve") }),
  MutationSchema.extend({ decision: z.literal("request_changes"), reason: text(2000).min(1) }),
  MutationSchema.extend({ decision: z.literal("reject"), reason: text(2000).min(1) }),
]);
export const ReadNotificationsBodySchema = z.strictObject({ notification_ids: z.array(z.string().min(1).max(100)).min(1).max(50) });
export const PaginationSchema = z.strictObject({ limit: z.coerce.number().int().min(1).max(50).default(20), offset: z.coerce.number().int().min(0).default(0) });
export const AdminApplicationQuerySchema = PaginationSchema.extend({ limit: z.coerce.number().int().min(1).max(100).default(20), status: ApplicationStatusSchema.default("submitted"), q: text(100).optional() });
export type SellerSummary = Pick<SellerDTO, "id" | "name" | "handle" | "status" | "currency_code">;
export type ApplicantSummary = Pick<HttpTypes.StoreCustomer, "id" | "email" | "first_name" | "last_name">;
const date = z.iso.datetime();
const ReviewSummarySchema = z.strictObject({ decision: z.enum(["approve", "request_changes", "reject"]), reason: z.string().nullable(), created_at: date });
export const ApplicationViewSchema = z.strictObject({
  id: z.string(), status: ApplicationStatusSchema, version: z.number().int(), current_step: WizardStepSchema,
  data: DraftDataSchema, submitted_data: DraftDataSchema.nullable(), submission_revision: z.number().int(),
  submitted_at: date.nullable(), reviewed_at: date.nullable(), created_at: date, updated_at: date,
  review: ReviewSummarySchema.nullable(), approval_state: ApprovalStateSchema,
  seller: z.custom<SellerSummary>().nullable(), can_edit: z.boolean(), can_submit: z.boolean(), can_access_vendor: z.boolean(),
});
export const ApplicationResponseSchema = z.strictObject({ application: ApplicationViewSchema.nullable(), applicant: z.strictObject({ email: z.string(), email_verified: z.boolean(), existing_vendor_access: z.boolean(), email_verification_test_mode: z.boolean().optional() }), unread_count: z.number().int() });
export const ApplicationNotificationSchema = z.strictObject({ id: z.string(), type: z.enum(["submitted", "changes_requested", "approved", "rejected"]), reason: z.string().nullable(), created_at: date, read_at: date.nullable() });
export const AdminApplicationEventSchema = ApplicationNotificationSchema.extend({ submission_revision: z.number().int(), reviewer_id: z.string().nullable(), submitted_data: DraftDataSchema.nullable() });
export const AdminApplicationSummarySchema = ApplicationViewSchema.pick({ id: true, status: true, version: true, submitted_at: true, reviewed_at: true, created_at: true, updated_at: true, approval_state: true }).extend({ customer: z.custom<ApplicantSummary>(), store_name: z.string(), business_type: z.enum(["individual", "company"]) });
export const AdminApplicationViewSchema = ApplicationViewSchema.extend({ customer: z.custom<ApplicantSummary>(), history: z.array(AdminApplicationEventSchema), approval_error_code: z.string().nullable() });
export const AdminApplicationResponseSchema = z.strictObject({ application: AdminApplicationViewSchema });
export const AdminApplicationListResponseSchema = z.strictObject({ applications: z.array(AdminApplicationSummarySchema), count: z.number(), limit: z.number(), offset: z.number() });
export const ApplicationOptionsResponseSchema = z.strictObject({ country_codes: z.array(z.string()), currency_codes: z.array(z.string()), terms_version: z.string() });
export const ApplicationNotificationsResponseSchema = z.strictObject({ notifications: z.array(ApplicationNotificationSchema), count: z.number(), limit: z.number(), offset: z.number(), unread_count: z.number() });
export const ReadNotificationsResponseSchema = z.strictObject({ unread_count: z.number() });
export const VerificationResponseSchema = z.strictObject({ requested: z.literal(true), retry_after_seconds: z.number(), test_code: z.string().min(1).max(512).optional() });
export const SetupCheckSchema = z.strictObject({ key: z.enum(["profile", "location", "first_product", "inventory"]), status: z.enum(["complete", "incomplete", "blocked"]), reason: z.string().nullable() });
export const VendorOnboardingResponseSchema = z.strictObject({ seller: z.custom<SellerSummary>(), checks: z.array(SetupCheckSchema), completed_count: z.number(), total_count: z.number() });
export type ApplicationStatus = z.infer<typeof ApplicationStatusSchema>;
export type ApprovalState = z.infer<typeof ApprovalStateSchema>;
export type WizardStep = z.infer<typeof WizardStepSchema>;
export type BusinessAddress = z.infer<typeof BusinessAddressSchema>;
export type DraftData = z.infer<typeof DraftDataSchema>;
export type SaveApplicationBody = z.infer<typeof SaveApplicationBodySchema>;
export type SubmitApplicationBody = z.infer<typeof SubmitApplicationBodySchema>;
export type ReviewApplicationBody = z.infer<typeof ReviewApplicationBodySchema>;
export type ReadNotificationsBody = z.infer<typeof ReadNotificationsBodySchema>;
export type ApplicationView = z.infer<typeof ApplicationViewSchema>;
export type ApplicationResponse = z.infer<typeof ApplicationResponseSchema>;
export type ApplicationNotification = z.infer<typeof ApplicationNotificationSchema>;
export type AdminApplicationEvent = z.infer<typeof AdminApplicationEventSchema>;
export type AdminApplicationSummary = z.infer<typeof AdminApplicationSummarySchema>;
export type AdminApplicationView = z.infer<typeof AdminApplicationViewSchema>;
export type AdminApplicationResponse = z.infer<typeof AdminApplicationResponseSchema>;
export type ReviewApplicationResponse = AdminApplicationResponse;
export type AdminApplicationListResponse = z.infer<typeof AdminApplicationListResponseSchema>;
export type ApplicationOptionsResponse = z.infer<typeof ApplicationOptionsResponseSchema>;
export type ApplicationNotificationsResponse = z.infer<typeof ApplicationNotificationsResponseSchema>;
export type ReadNotificationsResponse = z.infer<typeof ReadNotificationsResponseSchema>;
export type VerificationResponse = z.infer<typeof VerificationResponseSchema>;
export type SetupCheck = z.infer<typeof SetupCheckSchema>;
export type VendorOnboardingResponse = z.infer<typeof VendorOnboardingResponseSchema>;
