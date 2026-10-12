import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261004072026 extends Migration {
  override async up(): Promise<void> {
    // Safe to replay after the same hardening was applied through Supabase.
    this.addSql(
      `alter function public.reject_finance_sale_snapshot_update() set search_path = '';`,
    );
    this.addSql(
      `alter function public.reject_order_completion_update() set search_path = '';`,
    );
    this.addSql(
      `revoke execute on function public.reject_finance_sale_snapshot_update() from public;`,
    );
  }

  override async down(): Promise<void> {
    throw new Error(
      "Immutable trigger hardening cannot be reversed automatically. Restore only explicitly reviewed function settings and grants.",
    );
  }
}
