import { model } from "@medusajs/framework/utils";

export const VendorApplicationMutation = model.define("vendor_application_mutation", {
  id: model.id({ prefix: "vappmut" }).primaryKey(), application_id: model.text(), customer_id: model.text(),
  mutation_id: model.text(), actor_id: model.text(), request_hash: model.text(), expected_version: model.number(),
  operation: model.text(), state: model.enum(["processing", "complete", "failed"]), transaction_id: model.text(),
  member_id: model.text().nullable(), seller_id: model.text().nullable(), created_member: model.boolean().default(false),
  warehouse_id: model.text().nullable(), warehouse_ready: model.boolean().default(false),
  result: model.json().nullable(), error_code: model.text().nullable(),
}).indexes([{ on: ["customer_id", "mutation_id"], unique: true, where: "true" }, { on: ["application_id", "mutation_id"], unique: true, where: "true" }]);
