import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261015212035 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "finance_provider_cost"
      drop constraint "finance_provider_cost_mode_check",
      add constraint "finance_provider_cost_mode_check" check (mode in ('test', 'live'));`);
    this.addSql(`alter table "finance_provider_fact"
      drop constraint "finance_provider_fact_mode_check",
      add constraint "finance_provider_fact_mode_check" check (mode in ('test', 'live'));`);
    this.addSql(`alter table "vendor_finance_reporting_projection"
      drop constraint "vendor_finance_reporting_projection_mode_check",
      add constraint "vendor_finance_reporting_projection_mode_check" check (mode in ('test', 'live'));`);
    this.addSql(`alter table "vendor_settlement_projection"
      drop constraint "vendor_settlement_projection_mode_check",
      add constraint "vendor_settlement_projection_mode_check" check (mode in ('test', 'live'));`);
  }

  override async down(): Promise<void> {
    // Include soft-deleted rows: rollback must never delete or relabel LIVE evidence.
    this.addSql(`do $stripe_mode_rollback$
      begin
        lock table "finance_provider_cost", "finance_provider_fact",
          "vendor_finance_reporting_projection", "vendor_settlement_projection" in access exclusive mode;
        if exists (select 1 from "finance_provider_cost" where mode = 'live')
          or exists (select 1 from "finance_provider_fact" where mode = 'live')
          or exists (select 1 from "vendor_finance_reporting_projection" where mode = 'live')
          or exists (select 1 from "vendor_settlement_projection" where mode = 'live') then
          raise exception 'Cannot restore TEST-only Stripe constraints while LIVE evidence exists.';
        end if;
        alter table "finance_provider_cost"
          drop constraint "finance_provider_cost_mode_check",
          add constraint "finance_provider_cost_mode_check" check (mode in ('test'));
        alter table "finance_provider_fact"
          drop constraint "finance_provider_fact_mode_check",
          add constraint "finance_provider_fact_mode_check" check (mode in ('test'));
        alter table "vendor_finance_reporting_projection"
          drop constraint "vendor_finance_reporting_projection_mode_check",
          add constraint "vendor_finance_reporting_projection_mode_check" check (mode in ('test'));
        alter table "vendor_settlement_projection"
          drop constraint "vendor_settlement_projection_mode_check",
          add constraint "vendor_settlement_projection_mode_check" check (mode in ('test'));
      end
    $stripe_mode_rollback$;`);
  }
}
