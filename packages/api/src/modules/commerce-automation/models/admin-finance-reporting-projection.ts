import { model } from "@medusajs/framework/utils";

export const AdminFinanceReportingProjection = model.define(
  "admin_finance_reporting_projection",
  {
    id: model.text().primaryKey(),
    cart_id: model.text(),
    format_version: model.number().default(1),
    source_revision: model.text(),
    invalidation_token: model.text().nullable(),
    refreshed_at: model.dateTime(),
    sources: model.json(),
  },
);
