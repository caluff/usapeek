import { model } from "@medusajs/framework/utils";

export const VendorApplicationEvent = model.define("vendor_application_event", {
  id: model.id({ prefix: "vappevt" }).primaryKey(), application_id: model.text(), customer_id: model.text(),
  type: model.enum(["submitted", "changes_requested", "approved", "rejected"]), reason: model.text().nullable(),
  reviewer_id: model.text().nullable(), submission_revision: model.number(), submitted_data: model.json(),
  read_at: model.dateTime().nullable(),
  email_state: model.enum(["pending", "processing", "sent", "unconfigured", "failed"]).default("pending"),
  email_attempts: model.number().default(0), email_claimed_at: model.dateTime().nullable(),
}).indexes([{ on: ["application_id", "created_at"] }, { on: ["customer_id", "read_at"] }, { on: ["email_state", "created_at"] }]);
