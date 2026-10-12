import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260922224024 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "finance_recovery_attempt" drop constraint if exists "finance_recovery_attempt_token_unique";`);
    this.addSql(`alter table if exists "finance_provider_cost" drop constraint if exists "finance_provider_cost_mode_account_id_balance_transaction_id_unique";`);
    this.addSql(`create table if not exists "finance_provider_cost" ("id" text not null, "mode" text check ("mode" in ('test')) not null, "account_id" text not null, "balance_transaction_id" text not null, "cost" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "finance_provider_cost_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_finance_provider_cost_deleted_at" ON "finance_provider_cost" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_finance_provider_cost_mode_account_id_balance_transaction_id_unique" ON "finance_provider_cost" ("mode", "account_id", "balance_transaction_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "finance_provider_fact" ("id" text not null, "group_id" text not null, "operation_id" text null, "order_id" text null, "seller_id" text null, "mode" text check ("mode" in ('test')) not null, "account_id" text not null, "kind" text check ("kind" in ('capture', 'refund', 'transfer', 'reversal', 'authorization_release')) not null, "effective_at" timestamptz null, "fact" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "finance_provider_fact_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_finance_provider_fact_deleted_at" ON "finance_provider_fact" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_finance_provider_fact_group_id" ON "finance_provider_fact" ("group_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_finance_provider_fact_operation_id" ON "finance_provider_fact" ("operation_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_finance_provider_fact_seller_id_effective_at" ON "finance_provider_fact" ("seller_id", "effective_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "finance_recovery_attempt" ("id" text not null, "operation_id" text not null, "group_id" text not null, "actor_id" text not null, "reason" text not null, "prior_token" text not null, "token" text not null, "prior_state" text check ("prior_state" in ('processing', 'complete', 'uncertain')) not null, "state" text check ("state" in ('processing', 'complete', 'uncertain', 'interrupted')) not null, "original_result" jsonb null, "original_group" jsonb not null, "plan" jsonb not null, "observation" jsonb not null, "checkpoint_result" jsonb null, "checkpointed_at" timestamptz null, "final_result" jsonb null, "final_observation" jsonb null, "finished_at" timestamptz null, "superseded_by" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "finance_recovery_attempt_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_finance_recovery_attempt_deleted_at" ON "finance_recovery_attempt" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_finance_recovery_attempt_operation_id" ON "finance_recovery_attempt" ("operation_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_finance_recovery_attempt_group_id" ON "finance_recovery_attempt" ("group_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_finance_recovery_attempt_token_unique" ON "finance_recovery_attempt" ("token") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "finance_provider_cost" cascade;`);

    this.addSql(`drop table if exists "finance_provider_fact" cascade;`);

    this.addSql(`drop table if exists "finance_recovery_attempt" cascade;`);
  }

}
