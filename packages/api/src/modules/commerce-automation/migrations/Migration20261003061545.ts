import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261003061545 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "order_completion" ("id" text not null, "group_id" text not null, "cart_id" text not null, "seller_id" text not null, "observed_order_updated_at" timestamptz not null, "completed_at" timestamptz not null, "eligible_at" timestamptz not null, "registration_token" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "order_completion_pkey" primary key ("id"));`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_order_completion_deleted_at" ON "order_completion" ("deleted_at") WHERE deleted_at IS NULL;`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_order_completion_eligible_at_id" ON "order_completion" ("eligible_at", "id") WHERE deleted_at IS NULL;`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_order_completion_group_id" ON "order_completion" ("group_id") WHERE deleted_at IS NULL;`,
    );
    this
      .addSql(`alter table "order_completion" add constraint "order_completion_retention" check (
      isfinite(observed_order_updated_at) and isfinite(completed_at) and isfinite(eligible_at)
      and extract(epoch from eligible_at - completed_at) = 259200
    );`);
    this
      .addSql(`create function reject_order_completion_update() returns trigger language plpgsql as $$
      begin raise exception 'Order completion clocks and bindings are immutable.'; end;
    $$;`);
    this
      .addSql(`create trigger order_completion_immutable before update on "order_completion"
      for each row execute function reject_order_completion_update();`);
    // Earlier hardening runs before the financial tables are created.
    for (const table of [
      "finance_sale_snapshot",
      "finance_provider_cost",
      "finance_provider_fact",
      "finance_recovery_attempt",
      "order_completion",
    ]) {
      this.addSql(`alter table "${table}" enable row level security;`);
      this.addSql(`revoke all on table "${table}" from public;`);
    }
    this.addSql(`revoke all on function reject_order_completion_update() from public;`);
    this.addSql(`do $private_clock$
      declare api_role text; private_table text;
      begin
        for api_role in select rolname from pg_roles where rolname in ('anon', 'authenticated') loop
          foreach private_table in array array[
            'finance_sale_snapshot', 'finance_provider_cost', 'finance_provider_fact',
            'finance_recovery_attempt', 'order_completion'
          ] loop
            execute format('revoke all on table %I from %I', private_table, api_role);
          end loop;
          execute format('revoke all on function reject_order_completion_update() from %I', api_role);
        end loop;
      end
    $private_clock$;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "order_completion" cascade;`);
    this.addSql(`drop function if exists reject_order_completion_update();`);
  }
}
