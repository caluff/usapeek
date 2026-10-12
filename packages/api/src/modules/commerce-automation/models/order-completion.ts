import { model } from "@medusajs/framework/utils";

export const OrderCompletion = model
  .define("order_completion", {
    id: model.text().primaryKey(),
    group_id: model.text(),
    cart_id: model.text(),
    seller_id: model.text(),
    observed_order_updated_at: model.dateTime(),
    completed_at: model.dateTime(),
    eligible_at: model.dateTime(),
    release_delay_days: model.number().default(3),
    registration_token: model.text(),
  })
  .indexes([
    { on: ["eligible_at", "id"] },
    { on: ["group_id"] },
    { on: ["seller_id", "eligible_at", "id"] },
  ]);
