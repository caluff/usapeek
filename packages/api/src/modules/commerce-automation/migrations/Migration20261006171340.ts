import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261006171340 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "order_completion" add column if not exists "release_delay_days" integer not null default 3;`,
    );
    this.addSql(`alter table "order_completion"
      drop constraint "order_completion_retention",
      add constraint "order_completion_retention" check (
        release_delay_days between 0 and 365
        and isfinite(observed_order_updated_at) and isfinite(completed_at) and isfinite(eligible_at)
        and extract(epoch from eligible_at - completed_at) = release_delay_days * 86400
      );`);
  }

  override async down(): Promise<void> {
    // Rollback must preserve every immutable clock, including soft-deleted rows.
    this.addSql(`do $release_delay_rollback$
      begin
        lock table "order_completion" in access exclusive mode;
        if exists (select 1 from "order_completion" where release_delay_days <> 3) then
          raise exception 'Cannot remove release delay snapshots while non-three-day completion clocks exist.';
        end if;
        alter table "order_completion" drop constraint "order_completion_retention";
        alter table "order_completion" add constraint "order_completion_retention" check (
          isfinite(observed_order_updated_at) and isfinite(completed_at) and isfinite(eligible_at)
          and extract(epoch from eligible_at - completed_at) = 259200
        );
        alter table "order_completion" drop column "release_delay_days";
      end
    $release_delay_rollback$;`);
  }
}
