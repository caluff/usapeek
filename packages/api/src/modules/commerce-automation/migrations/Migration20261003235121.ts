import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261003235121 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "vendor_settlement_projection" ("id" text not null, "seller_id" text not null, "group_id" text not null, "cart_id" text not null, "mode" text check ("mode" in ('test')) not null default 'test', "currency_code" text check ("currency_code" in ('usd')) not null default 'usd', "data_kind" text check ("data_kind" in ('ordinary', 'qa_fixture', 'unknown')) not null, "pending_amount" text null, "status" text check ("status" in ('waiting', 'processing', 'needs_review', 'released', 'inactive')) not null, "source_revision" text null, "invalidation_token" text null, "evaluated_token" text null, "refreshed_at" timestamptz null, "projection" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "vendor_settlement_projection_pkey" primary key ("id"));`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_vendor_settlement_projection_deleted_at" ON "vendor_settlement_projection" ("deleted_at") WHERE deleted_at IS NULL;`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_vendor_settlement_projection_seller_id_data_kind_status" ON "vendor_settlement_projection" ("seller_id", "data_kind", "status") WHERE deleted_at IS NULL;`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_vendor_settlement_projection_group_id" ON "vendor_settlement_projection" ("group_id") WHERE deleted_at IS NULL;`,
    );

    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_order_completion_seller_id_eligible_at_id" ON "order_completion" ("seller_id", "eligible_at", "id") WHERE deleted_at IS NULL;`,
    );
    this
      .addSql(`alter table "vendor_settlement_projection" add constraint "vendor_settlement_amount_exact"
      check (pending_amount is null or (pending_amount ~ '^[0-9]+[.][0-9]{2}$' and pending_amount::numeric >= 0));`);
    this
      .addSql(`alter table "vendor_settlement_projection" add constraint "vendor_settlement_released_zero"
      check (status <> 'released' or (pending_amount is not null and pending_amount = '0.00'));`);
    this.addSql(
      `alter table "vendor_settlement_projection" enable row level security;`,
    );
    this.addSql(
      `revoke all on table "vendor_settlement_projection" from public;`,
    );
    this.addSql(`do $private_registry$
      declare api_role text;
      begin
        for api_role in select rolname from pg_roles where rolname in ('anon', 'authenticated') loop
          execute format('revoke all on table vendor_settlement_projection from %I', api_role);
        end loop;
      end
    $private_registry$;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "vendor_settlement_projection" cascade;`);

    this.addSql(
      `drop index if exists "IDX_order_completion_seller_id_eligible_at_id";`,
    );
  }
}
