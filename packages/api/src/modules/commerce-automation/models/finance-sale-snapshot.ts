import { model } from "@medusajs/framework/utils";

export const FinanceSaleSnapshot = model
  .define("finance_sale_snapshot", {
    id: model.text().primaryKey(),
    group_id: model.text(),
    cart_id: model.text(),
    seller_id: model.text(),
    currency_code: model.text(),
    original: model.json(),
  })
  .indexes([{ on: ["group_id"] }, { on: ["seller_id", "created_at"] }]);
