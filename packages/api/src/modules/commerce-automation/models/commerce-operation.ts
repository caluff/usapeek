import { model } from "@medusajs/framework/utils";

export const CommerceOperation = model
  .define("commerce_operation", {
    id: model.text().primaryKey(),
    group_id: model.text(),
    token: model.text(),
    kind: model.enum(["cancel", "capture", "payout", "refund"]),
    target_id: model.text(),
    state: model.enum(["processing", "complete", "uncertain"]),
    result: model.json().nullable(),
  })
  .indexes([{ on: ["group_id"] }]);
