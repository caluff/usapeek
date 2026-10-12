import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261004012955 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "vendor_finance_reporting_projection" ("id" text not null, "seller_id" text not null, "group_id" text not null, "cart_id" text not null, "mode" text check ("mode" in ('test')) not null default 'test', "currency_code" text check ("currency_code" in ('usd')) not null default 'usd', "native_revision" text null, "order_display_id" integer null, "order_custom_display_id" text null, "source_revision" text null, "invalidation_token" text null, "evaluated_token" text null, "refreshed_at" timestamptz null, "sources" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "vendor_finance_reporting_projection_pkey" primary key ("id"));`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_vendor_finance_reporting_projection_deleted_at" ON "vendor_finance_reporting_projection" ("deleted_at") WHERE deleted_at IS NULL;`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_vendor_finance_reporting_projection_seller_id_id" ON "vendor_finance_reporting_projection" ("seller_id", "id") WHERE deleted_at IS NULL;`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_vendor_finance_reporting_projection_group_id" ON "vendor_finance_reporting_projection" ("group_id") WHERE deleted_at IS NULL;`,
    );
    this.addSql(
      `alter table "vendor_finance_reporting_projection" add constraint "vendor_finance_reporting_sources_object" check (sources is null or jsonb_typeof(sources) = 'object');`,
    );
    this.addSql(
      `alter table "vendor_finance_reporting_projection" enable row level security;`,
    );
    this.addSql(
      `revoke all on table "vendor_finance_reporting_projection" from public;`,
    );
    this.addSql(`do $private_reporting$
      declare api_role text;
      begin
        for api_role in select rolname from pg_roles where rolname in ('anon', 'authenticated') loop
          execute format('revoke all on table vendor_finance_reporting_projection from %I', api_role);
        end loop;
      end
    $private_reporting$;`);
  }

  override async down(): Promise<void> {
    this.addSql(
      `drop table if exists "vendor_finance_reporting_projection" cascade;`,
    );
  }
}
