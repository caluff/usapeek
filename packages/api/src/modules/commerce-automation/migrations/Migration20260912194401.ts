import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260912194401 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "commerce_operation" drop constraint if exists "commerce_operation_kind_check";`);

    this.addSql(`alter table if exists "commerce_operation" add constraint "commerce_operation_kind_check" check("kind" in ('cancel', 'capture', 'payout', 'refund'));`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "commerce_operation" drop constraint if exists "commerce_operation_kind_check";`);

    this.addSql(`alter table if exists "commerce_operation" add constraint "commerce_operation_kind_check" check("kind" in ('cancel', 'capture', 'payout'));`);
  }

}
