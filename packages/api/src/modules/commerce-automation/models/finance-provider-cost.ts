import { model } from "@medusajs/framework/utils";

export const FinanceProviderCost = model
  .define("finance_provider_cost", {
    id: model.text().primaryKey(),
    mode: model.enum(["test"]),
    account_id: model.text(),
    balance_transaction_id: model.text(),
    cost: model.json(),
  })
  .indexes([
    { on: ["mode", "account_id", "balance_transaction_id"], unique: true },
  ]);
