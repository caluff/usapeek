import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260919221631 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "finance_sale_snapshot" ("id" text not null, "group_id" text not null, "cart_id" text not null, "seller_id" text not null, "currency_code" text not null, "original" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "finance_sale_snapshot_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_finance_sale_snapshot_deleted_at" ON "finance_sale_snapshot" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_finance_sale_snapshot_group_id" ON "finance_sale_snapshot" ("group_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_finance_sale_snapshot_seller_id_created_at" ON "finance_sale_snapshot" ("seller_id", "created_at") WHERE deleted_at IS NULL;`);
    this.addSql(`alter table "finance_sale_snapshot" add constraint "finance_sale_snapshot_identity" check (
      original->>'order_id' = id and original->>'group_id' = group_id and original->>'cart_id' = cart_id
      and original->>'seller_id' = seller_id and original->>'currency_code' = currency_code
      and original->>'version' = '1' and currency_code = 'usd'
    );`);
    this.addSql(`create function reject_finance_sale_snapshot_update() returns trigger language plpgsql as $$
      begin raise exception 'Original financial snapshots are immutable; record a separate adjustment.'; end;
    $$;`);
    this.addSql(`create trigger finance_sale_snapshot_immutable before update on "finance_sale_snapshot"
      for each row execute function reject_finance_sale_snapshot_update();`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "finance_sale_snapshot" cascade;`);
    this.addSql(`drop function if exists reject_finance_sale_snapshot_update();`);
  }

}
