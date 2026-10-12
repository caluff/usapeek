import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261003173018 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "seller_catalog_permission" drop constraint if exists "seller_catalog_permission_seller_id_unique";`,
    );
    this.addSql(
      `create table if not exists "seller_catalog_permission" ("id" text not null, "seller_id" text not null, "mode" text check ("mode" in ('supervised', 'authorized')) not null default 'supervised', "changed_by" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "seller_catalog_permission_pkey" primary key ("id"));`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_seller_catalog_permission_deleted_at" ON "seller_catalog_permission" ("deleted_at") WHERE deleted_at IS NULL;`,
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_seller_catalog_permission_seller_id_unique" ON "seller_catalog_permission" ("seller_id") WHERE true AND deleted_at IS NULL;`,
    );
    this.addSql(
      `alter table "seller_catalog_permission" enable row level security;`,
    );
    this.addSql(`revoke all on table "seller_catalog_permission" from public;`);
    this.addSql(`do $private_catalog_permission$
      declare api_role text;
      begin
        for api_role in select rolname from pg_roles where rolname in ('anon', 'authenticated') loop
          execute format('revoke all on table seller_catalog_permission from %I', api_role);
        end loop;
      end
    $private_catalog_permission$;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "seller_catalog_permission" cascade;`);
  }
}
