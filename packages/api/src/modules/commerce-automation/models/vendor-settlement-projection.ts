import { model } from "@medusajs/framework/utils";

export const VendorSettlementProjection = model
  .define("vendor_settlement_projection", {
    id: model.text().primaryKey(),
    seller_id: model.text(),
    group_id: model.text(),
    cart_id: model.text(),
    mode: model.enum(["test"]).default("test"),
    currency_code: model.enum(["usd"]).default("usd"),
    data_kind: model.enum(["ordinary", "qa_fixture", "unknown"]),
    // Exact decimal in display units; SQL casts it to numeric for aggregation.
    pending_amount: model.text().nullable(),
    status: model.enum([
      "waiting",
      "processing",
      "needs_review",
      "released",
      "inactive",
    ]),
    source_revision: model.text().nullable(),
    invalidation_token: model.text().nullable(),
    evaluated_token: model.text().nullable(),
    refreshed_at: model.dateTime().nullable(),
    projection: model.json(),
  })
  .indexes([
    { on: ["seller_id", "data_kind", "status"] },
    { on: ["group_id"] },
  ]);
