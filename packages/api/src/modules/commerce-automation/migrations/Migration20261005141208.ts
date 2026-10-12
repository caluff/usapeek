import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261005141208 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "admin_finance_reporting_projection" ("id" text not null, "cart_id" text not null, "format_version" integer not null default 1, "source_revision" text not null, "invalidation_token" text null, "refreshed_at" timestamptz not null, "sources" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "admin_finance_reporting_projection_pkey" primary key ("id"));`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_admin_finance_reporting_projection_deleted_at" ON "admin_finance_reporting_projection" ("deleted_at") WHERE deleted_at IS NULL;`,
    );
    this.addSql(
      `alter table "admin_finance_reporting_projection" add constraint "admin_finance_reporting_sources_object" check (jsonb_typeof(sources) = 'object');`,
    );
    this.addSql(
      `alter table "admin_finance_reporting_projection" enable row level security;`,
    );
    this.addSql(
      `revoke all on table "admin_finance_reporting_projection" from public;`,
    );
    this.addSql(`do $private_admin_reporting$
      declare api_role text;
      begin
        for api_role in select rolname from pg_roles where rolname in ('anon', 'authenticated') loop
          execute format('revoke all on table admin_finance_reporting_projection from %I', api_role);
        end loop;
      end
    $private_admin_reporting$;`);
  }

  override async down(): Promise<void> {
    this.addSql(
      `drop table if exists "admin_finance_reporting_projection" cascade;`,
    );
  }
}
