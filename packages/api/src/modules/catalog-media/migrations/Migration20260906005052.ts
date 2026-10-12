import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260906005052 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "catalog_image" drop constraint if exists "catalog_image_url_unique";`,
    );
    this.addSql(
      `alter table if exists "catalog_image" drop constraint if exists "catalog_image_file_id_unique";`,
    );
    this.addSql(
      `create table if not exists "catalog_image" ("id" text not null, "seller_id" text not null, "member_id" text not null, "file_id" text not null, "url" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "catalog_image_pkey" primary key ("id"));`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_catalog_image_deleted_at" ON "catalog_image" ("deleted_at") WHERE deleted_at IS NULL;`,
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_catalog_image_file_id_unique" ON "catalog_image" ("file_id") WHERE true AND deleted_at IS NULL;`,
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_catalog_image_url_unique" ON "catalog_image" ("url") WHERE true AND deleted_at IS NULL;`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_catalog_image_seller_id_url" ON "catalog_image" ("seller_id", "url") WHERE deleted_at IS NULL;`,
    );
    this.addSql(
      `create unique index "catalog_image_file_forever" on "catalog_image" ("file_id");`,
    );
    this.addSql(
      `create unique index "catalog_image_url_forever" on "catalog_image" ("url");`,
    );
    this
      .addSql(`create function public.catalog_image_preserve_owner() returns trigger language plpgsql set search_path = '' as $$
      begin
        if row(new.seller_id,new.member_id,new.file_id,new.url)
          is distinct from row(old.seller_id,old.member_id,old.file_id,old.url)
        then raise exception 'Catalog image ownership is immutable' using errcode = '23514'; end if;
        return new;
      end $$;`);
    this.addSql(
      `create trigger catalog_image_owner_immutable before update on catalog_image for each row execute function public.catalog_image_preserve_owner();`,
    );
    this.addSql(
      `revoke all on function public.catalog_image_preserve_owner() from public;`,
    );
    this.addSql(
      `alter table catalog_image enable row level security; revoke all on table catalog_image from public;`,
    );
    this.addSql(`do $$ begin
      if exists(select 1 from pg_roles where rolname='anon') then revoke all on table catalog_image from anon; end if;
      if exists(select 1 from pg_roles where rolname='authenticated') then revoke all on table catalog_image from authenticated; end if;
    end $$;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "catalog_image";`);
    this.addSql(`drop function public.catalog_image_preserve_owner();`);
  }
}
