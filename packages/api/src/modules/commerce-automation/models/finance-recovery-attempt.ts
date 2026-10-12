import { model } from "@medusajs/framework/utils";

export const FinanceRecoveryAttempt = model
  .define("finance_recovery_attempt", {
    id: model.text().primaryKey(),
    operation_id: model.text(),
    group_id: model.text(),
    actor_id: model.text(),
    reason: model.text(),
    prior_token: model.text(),
    token: model.text(),
    prior_state: model.enum(["processing", "complete", "uncertain"]),
    state: model.enum(["processing", "complete", "uncertain", "interrupted"]),
    original_result: model.json().nullable(),
    original_group: model.json(),
    plan: model.json(),
    observation: model.json(),
    checkpoint_result: model.json().nullable(),
    checkpointed_at: model.dateTime().nullable(),
    final_result: model.json().nullable(),
    final_observation: model.json().nullable(),
    finished_at: model.dateTime().nullable(),
    superseded_by: model.text().nullable(),
  })
  .indexes([
    { on: ["operation_id"] },
    { on: ["group_id"] },
    { on: ["token"], unique: true },
  ]);
