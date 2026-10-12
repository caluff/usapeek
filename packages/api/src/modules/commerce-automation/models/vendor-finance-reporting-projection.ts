import { model } from "@medusajs/framework/utils";

export const VendorFinanceReportingProjection = model
  .define("vendor_finance_reporting_projection", {
    id: model.text().primaryKey(),
    seller_id: model.text(),
    group_id: model.text(),
    cart_id: model.text(),
    mode: model.enum(["test"]).default("test"),
    currency_code: model.enum(["usd"]).default("usd"),
    native_revision: model.text().nullable(),
    order_display_id: model.number().nullable(),
    order_custom_display_id: model.text().nullable(),
    source_revision: model.text().nullable(),
    invalidation_token: model.text().nullable(),
    evaluated_token: model.text().nullable(),
    refreshed_at: model.dateTime().nullable(),
    sources: model.json().nullable(),
  })
  .indexes([{ on: ["seller_id", "id"] }, { on: ["group_id"] }]);
