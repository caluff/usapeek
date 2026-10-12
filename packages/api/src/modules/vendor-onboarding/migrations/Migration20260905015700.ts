import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260905015700 extends Migration {
  override async up(): Promise<void> {
    // The trigger uses only NEW/OLD fields; it needs no application schema lookup.
    this.addSql(`alter function public.vendor_application_preserve_audit() set search_path = '';`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter function public.vendor_application_preserve_audit() reset search_path;`);
  }
}
