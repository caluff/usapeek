import { model } from "@medusajs/framework/utils";

export const CommerceGroupState = model.define("commerce_group_state", {
  id: model.text().primaryKey(),
  cart_id: model.text(),
  active_token: model.text().nullable(),
  review_required: model.boolean().default(false),
  observation: model.json().nullable(),
});
