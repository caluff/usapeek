import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260905012452 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "vendor_application_mutation" drop constraint if exists "vendor_application_mutation_application_id_mutation_id_unique";`);
    this.addSql(`alter table if exists "vendor_application_mutation" drop constraint if exists "vendor_application_mutation_customer_id_mutation_id_unique";`);
    this.addSql(`alter table if exists "vendor_application" drop constraint if exists "vendor_application_member_id_unique";`);
    this.addSql(`alter table if exists "vendor_application" drop constraint if exists "vendor_application_seller_id_unique";`);
    this.addSql(`alter table if exists "vendor_application" drop constraint if exists "vendor_application_auth_identity_id_unique";`);
    this.addSql(`alter table if exists "vendor_application" drop constraint if exists "vendor_application_customer_id_unique";`);
    this.addSql(`create table if not exists "vendor_application" ("id" text not null, "customer_id" text not null, "auth_identity_id" text not null, "applicant_email" text not null, "status" text check ("status" in ('draft', 'submitted', 'changes_requested', 'approved', 'rejected')) not null default 'draft', "version" integer not null default 1, "current_step" text not null, "data" jsonb not null, "submitted_data" jsonb null, "submission_revision" integer not null default 0, "submitted_at" timestamptz null, "reviewed_at" timestamptz null, "review" jsonb null, "terms_version" text null, "seller_id" text null, "member_id" text null, "approval_state" text check ("approval_state" in ('idle', 'processing', 'failed', 'complete')) not null default 'idle', "approval_operation_id" text null, "approval_error_code" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "vendor_application_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vendor_application_deleted_at" ON "vendor_application" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_vendor_application_customer_id_unique" ON "vendor_application" ("customer_id") WHERE true AND deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_vendor_application_auth_identity_id_unique" ON "vendor_application" ("auth_identity_id") WHERE true AND deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_vendor_application_seller_id_unique" ON "vendor_application" ("seller_id") WHERE seller_id IS NOT NULL AND deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_vendor_application_member_id_unique" ON "vendor_application" ("member_id") WHERE member_id IS NOT NULL AND deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vendor_application_status_submitted_at_id" ON "vendor_application" ("status", "submitted_at", "id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "vendor_application_event" ("id" text not null, "application_id" text not null, "customer_id" text not null, "type" text check ("type" in ('submitted', 'changes_requested', 'approved', 'rejected')) not null, "reason" text null, "reviewer_id" text null, "submission_revision" integer not null, "submitted_data" jsonb not null, "read_at" timestamptz null, "email_state" text check ("email_state" in ('pending', 'processing', 'sent', 'unconfigured', 'failed')) not null default 'pending', "email_attempts" integer not null default 0, "email_claimed_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "vendor_application_event_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vendor_application_event_deleted_at" ON "vendor_application_event" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vendor_application_event_application_id_created_at" ON "vendor_application_event" ("application_id", "created_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vendor_application_event_customer_id_read_at" ON "vendor_application_event" ("customer_id", "read_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vendor_application_event_email_state_created_at" ON "vendor_application_event" ("email_state", "created_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "vendor_application_mutation" ("id" text not null, "application_id" text not null, "customer_id" text not null, "mutation_id" text not null, "actor_id" text not null, "request_hash" text not null, "expected_version" integer not null, "operation" text not null, "state" text check ("state" in ('processing', 'complete', 'failed')) not null, "transaction_id" text not null, "member_id" text null, "seller_id" text null, "created_member" boolean not null default false, "result" jsonb null, "error_code" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "vendor_application_mutation_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vendor_application_mutation_deleted_at" ON "vendor_application_mutation" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_vendor_application_mutation_customer_id_mutation_id_unique" ON "vendor_application_mutation" ("customer_id", "mutation_id") WHERE true AND deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_vendor_application_mutation_application_id_mutation_id_unique" ON "vendor_application_mutation" ("application_id", "mutation_id") WHERE true AND deleted_at IS NULL;`);

    // DML indexes automatically exclude soft-deleted rows; applicant identities and replay keys must never be recycled.
    this.addSql(`create unique index if not exists vendor_application_customer_forever on vendor_application(customer_id);`);
    this.addSql(`create unique index if not exists vendor_application_identity_forever on vendor_application(auth_identity_id);`);
    this.addSql(`create unique index if not exists vendor_application_seller_forever on vendor_application(seller_id) where seller_id is not null;`);
    this.addSql(`create unique index if not exists vendor_application_member_forever on vendor_application(member_id) where member_id is not null;`);
    this.addSql(`create unique index if not exists vendor_application_mutation_forever on vendor_application_mutation(customer_id, mutation_id);`);
    this.addSql(`alter table vendor_application add constraint vendor_application_positive_version check (version > 0 and submission_revision >= 0);`);
    this.addSql(`alter table vendor_application_event add constraint vendor_application_event_application_fk foreign key(application_id) references vendor_application(id);`);
    this.addSql(`create or replace function vendor_application_preserve_audit() returns trigger language plpgsql as $$
      begin
        if TG_OP = 'DELETE' then raise exception 'Vendor onboarding audit records cannot be deleted' using errcode = '23514'; end if;
        if TG_TABLE_NAME = 'vendor_application_event' then
          if row(new.application_id,new.customer_id,new.type,new.reason,new.reviewer_id,new.submission_revision,new.submitted_data,new.created_at,new.deleted_at)
            is distinct from row(old.application_id,old.customer_id,old.type,old.reason,old.reviewer_id,old.submission_revision,old.submitted_data,old.created_at,old.deleted_at)
          then raise exception 'Vendor application history is immutable' using errcode = '23514'; end if;
        elsif TG_TABLE_NAME = 'vendor_application' then
          if row(new.customer_id,new.auth_identity_id,new.created_at,new.deleted_at) is distinct from row(old.customer_id,old.auth_identity_id,old.created_at,old.deleted_at)
            or (old.status in ('approved','rejected') and new.status <> old.status)
          then raise exception 'Vendor application identity and final decision are immutable' using errcode = '23514'; end if;
        end if;
        return new;
      end $$;`);
    this.addSql(`revoke all on function vendor_application_preserve_audit() from public;`);
    this.addSql(`create trigger vendor_application_event_immutable before update or delete on vendor_application_event for each row execute function vendor_application_preserve_audit();`);
    this.addSql(`create trigger vendor_application_identity_immutable before update or delete on vendor_application for each row execute function vendor_application_preserve_audit();`);
    for (const table of ["vendor_application", "vendor_application_event", "vendor_application_mutation"]) {
      this.addSql(`alter table "${table}" enable row level security;`);
      this.addSql(`revoke all on table "${table}" from public;`);
      this.addSql(`do $$ begin
        if exists(select 1 from pg_roles where rolname='anon') then revoke all on table "${table}" from anon; end if;
        if exists(select 1 from pg_roles where rolname='authenticated') then revoke all on table "${table}" from authenticated; end if;
      end $$;`);
    }
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "vendor_application" cascade;`);

    this.addSql(`drop table if exists "vendor_application_event" cascade;`);

    this.addSql(`drop table if exists "vendor_application_mutation" cascade;`);
    this.addSql(`drop function if exists vendor_application_preserve_audit();`);
  }

}
