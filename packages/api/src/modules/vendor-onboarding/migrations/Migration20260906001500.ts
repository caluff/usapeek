import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260906001500 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "vendor_application_mutation" add column "warehouse_id" text null, add column "warehouse_ready" boolean not null default false;`,
    );
    this.addSql(`create table "vendor_warehouse" (
      "id" text primary key, "seller_id" text not null, "stock_location_id" text not null,
      "application_id" text not null, "operation_id" text not null, "submission_revision" integer not null,
      "address" jsonb not null, "name" text not null, "created_location" boolean not null,
      "state" text not null default 'provisioning' check (state in ('provisioning','ready','released')),
      "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null,
      constraint "vendor_warehouse_seller_forever" unique ("seller_id"),
      constraint "vendor_warehouse_location_forever" unique ("stock_location_id")
    );`);
    this.addSql(
      `create index "IDX_vendor_warehouse_deleted_at" on "vendor_warehouse" ("deleted_at") where deleted_at is null;`,
    );
    this.addSql(
      `create unique index "IDX_vendor_warehouse_seller_id_unique" on "vendor_warehouse" ("seller_id") where true and deleted_at is null;`,
    );
    this.addSql(
      `create unique index "IDX_vendor_warehouse_stock_location_id_unique" on "vendor_warehouse" ("stock_location_id") where true and deleted_at is null;`,
    );
    this.addSql(
      `create index "IDX_vendor_warehouse_operation_id" on "vendor_warehouse" ("operation_id") where deleted_at is null;`,
    );
    this
      .addSql(`create function public.vendor_warehouse_preserve_claim() returns trigger language plpgsql set search_path = '' as $$
      begin
        if TG_OP = 'DELETE' then raise exception 'Warehouse claims cannot be deleted' using errcode = '23514'; end if;
        if row(new.id,new.seller_id,new.stock_location_id,new.application_id,new.operation_id,new.submission_revision,new.address,new.name,new.created_location,new.created_at,new.deleted_at)
          is distinct from row(old.id,old.seller_id,old.stock_location_id,old.application_id,old.operation_id,old.submission_revision,old.address,old.name,old.created_location,old.created_at,old.deleted_at)
          or (old.state = 'released' and new.state <> old.state)
        then raise exception 'Warehouse ownership and source are immutable' using errcode = '23514'; end if;
        return new;
      end $$;`);
    this.addSql(
      `create trigger vendor_warehouse_claim_immutable before update or delete on vendor_warehouse for each row execute function public.vendor_warehouse_preserve_claim();`,
    );
    this
      .addSql(`create function public.vendor_application_preserve_warehouse_source() returns trigger language plpgsql set search_path = '' as $$
      begin
        if (old.approval_state = 'processing' or old.status = 'approved') and
          row(new.submitted_data,new.submission_revision) is distinct from row(old.submitted_data,old.submission_revision)
        then raise exception 'Approved or provisioning application source is immutable' using errcode = '23514'; end if;
        return new;
      end $$;`);
    this.addSql(
      `create trigger vendor_application_warehouse_source_immutable before update on vendor_application for each row execute function public.vendor_application_preserve_warehouse_source();`,
    );
    this.addSql(
      `revoke all on function public.vendor_warehouse_preserve_claim(), public.vendor_application_preserve_warehouse_source() from public;`,
    );
    this.addSql(
      `alter table vendor_warehouse enable row level security; revoke all on table vendor_warehouse from public;`,
    );
    this.addSql(`do $$ begin
      if exists(select 1 from pg_roles where rolname='anon') then revoke all on table vendor_warehouse from anon; end if;
      if exists(select 1 from pg_roles where rolname='authenticated') then revoke all on table vendor_warehouse from authenticated; end if;
    end $$;`);
  }

  override async down(): Promise<void> {
    this.addSql(
      `drop trigger vendor_application_warehouse_source_immutable on vendor_application;`,
    );
    this.addSql(
      `drop function public.vendor_application_preserve_warehouse_source();`,
    );
    this.addSql(`drop table vendor_warehouse;`);
    this.addSql(`drop function public.vendor_warehouse_preserve_claim();`);
    this.addSql(
      `alter table vendor_application_mutation drop column warehouse_id, drop column warehouse_ready;`,
    );
  }
}
