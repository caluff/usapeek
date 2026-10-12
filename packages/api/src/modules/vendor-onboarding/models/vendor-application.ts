import { model } from "@medusajs/framework/utils";

export const VendorApplication = model.define("vendor_application", {
  id: model.id({ prefix: "vapp" }).primaryKey(),
  customer_id: model.text(), auth_identity_id: model.text(), applicant_email: model.text(),
  status: model.enum(["draft", "submitted", "changes_requested", "approved", "rejected"]).default("draft"),
  version: model.number().default(1), current_step: model.text(), data: model.json(),
  submitted_data: model.json().nullable(), submission_revision: model.number().default(0),
  submitted_at: model.dateTime().nullable(), reviewed_at: model.dateTime().nullable(),
  review: model.json().nullable(), terms_version: model.text().nullable(),
  seller_id: model.text().nullable(), member_id: model.text().nullable(),
  approval_state: model.enum(["idle", "processing", "failed", "complete"]).default("idle"),
  approval_operation_id: model.text().nullable(), approval_error_code: model.text().nullable(),
}).indexes([
  { on: ["customer_id"], unique: true, where: "true" },
  { on: ["auth_identity_id"], unique: true, where: "true" },
  { on: ["seller_id"], unique: true, where: "seller_id IS NOT NULL" },
  { on: ["member_id"], unique: true, where: "member_id IS NOT NULL" },
  { on: ["status", "submitted_at", "id"] },
]);
