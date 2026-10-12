import { model } from "@medusajs/framework/utils";

export const FinanceProviderFact = model
  .define("finance_provider_fact", {
    id: model.text().primaryKey(),
    group_id: model.text(),
    operation_id: model.text().nullable(),
    order_id: model.text().nullable(),
    seller_id: model.text().nullable(),
    mode: model.enum(["test"]),
    account_id: model.text(),
    kind: model.enum([
      "capture",
      "refund",
      "transfer",
      "reversal",
      "authorization_release",
    ]),
    effective_at: model.dateTime().nullable(),
    fact: model.json(),
  })
  .indexes([
    { on: ["group_id"] },
    { on: ["operation_id"] },
    { on: ["seller_id", "effective_at"] },
  ]);
