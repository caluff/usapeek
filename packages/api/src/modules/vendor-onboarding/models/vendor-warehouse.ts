import { model } from "@medusajs/framework/utils";

// A durable claim, not stock-location metadata, owns provisioning and recovery.
export const VendorWarehouse = model.define("vendor_warehouse", {
  id: model.id({ prefix: "vwh" }).primaryKey(),
  seller_id: model.text(), stock_location_id: model.text(),
  application_id: model.text(), operation_id: model.text(),
  submission_revision: model.number(), address: model.json(), name: model.text(),
  created_location: model.boolean(),
  state: model.enum(["provisioning", "ready", "released"]).default("provisioning"),
}).indexes([
  { on: ["seller_id"], unique: true, where: "true" },
  { on: ["stock_location_id"], unique: true, where: "true" },
  { on: ["operation_id"] },
]);
