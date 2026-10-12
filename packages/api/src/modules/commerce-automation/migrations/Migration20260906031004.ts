import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260906031004 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "commerce_group_state" ("id" text not null, "cart_id" text not null, "active_token" text null, "review_required" boolean not null default false, "observation" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "commerce_group_state_pkey" primary key ("id"));`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_commerce_group_state_deleted_at" ON "commerce_group_state" ("deleted_at") WHERE deleted_at IS NULL;`,
    );

    this.addSql(
      `create table if not exists "commerce_operation" ("id" text not null, "group_id" text not null, "token" text not null, "kind" text check ("kind" in ('cancel', 'capture', 'payout')) not null, "target_id" text not null, "state" text check ("state" in ('processing', 'complete', 'uncertain')) not null, "result" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "commerce_operation_pkey" primary key ("id"));`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_commerce_operation_deleted_at" ON "commerce_operation" ("deleted_at") WHERE deleted_at IS NULL;`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_commerce_operation_group_id" ON "commerce_operation" ("group_id") WHERE deleted_at IS NULL;`,
    );

    this.addSql(
      `create table if not exists "commerce_scan" ("id" text not null, "position" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "commerce_scan_pkey" primary key ("id"));`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_commerce_scan_deleted_at" ON "commerce_scan" ("deleted_at") WHERE deleted_at IS NULL;`,
    );
    // Internal Medusa records: browser Supabase roles must never manage fences.
    this.addSql(`alter table "commerce_group_state" enable row level security;
      alter table "commerce_operation" enable row level security;
      alter table "commerce_scan" enable row level security;
      revoke all on table "commerce_group_state", "commerce_operation", "commerce_scan" from public;`);
    this.addSql(`do $$ begin
      if exists(select 1 from pg_roles where rolname='anon') then
        revoke all on table "commerce_group_state", "commerce_operation", "commerce_scan" from anon;
      end if;
      if exists(select 1 from pg_roles where rolname='authenticated') then
        revoke all on table "commerce_group_state", "commerce_operation", "commerce_scan" from authenticated;
      end if;
    end $$;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "commerce_group_state" cascade;`);

    this.addSql(`drop table if exists "commerce_operation" cascade;`);

    this.addSql(`drop table if exists "commerce_scan" cascade;`);
  }
}
