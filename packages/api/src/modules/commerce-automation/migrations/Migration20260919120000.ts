import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/** The application's public schema is private to Medusa, not a Data API. */
export class Migration20260919120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`do $hardening$
      declare
        relation record;
        routine record;
        api_role text;
      begin
        if current_user in ('anon', 'authenticated', 'service_role') then
          raise exception 'Database hardening requires the dedicated backend owner';
        end if;
        if current_schema() <> 'public' then
          raise exception 'Database hardening requires the reviewed public application schema';
        end if;
        if exists (
          select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
            and c.relowner <> (select oid from pg_roles where rolname = current_user)
            and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass
              and d.objid = c.oid and d.deptype = 'e')
        ) then
          raise exception 'Unreviewed object owner in application schema; review backend consumers before hardening';
        end if;
        if exists (
          select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
          cross join lateral aclexplode(c.relacl) a join pg_roles r on r.oid = a.grantee
          where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
            and a.grantee <> c.relowner and r.rolname not in ('anon', 'authenticated')
            and not r.rolsuper and not r.rolbypassrls
        ) then
          raise exception 'Unreviewed non-owner backend grant; define its RLS policy before hardening';
        end if;

        -- Keep the application's own access when it previously inherited PUBLIC.
        execute format('grant usage, create on schema public to %I', current_user);
        revoke all on schema public from public;

        for relation in
          select c.relname, c.relkind from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
            and c.relowner = (select oid from pg_roles where rolname = current_user)
            and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass
              and d.objid = c.oid and d.deptype = 'e')
        loop
          if relation.relkind in ('r', 'p') then
            execute format('alter table public.%I enable row level security', relation.relname);
          end if;
          execute format('revoke all on %s public.%I from public',
            case when relation.relkind = 'S' then 'sequence' else 'table' end, relation.relname);
          for api_role in select rolname from pg_roles where rolname in ('anon', 'authenticated') loop
            execute format('revoke all on %s public.%I from %I',
              case when relation.relkind = 'S' then 'sequence' else 'table' end, relation.relname, api_role);
          end loop;
        end loop;

        for routine in
          select p.oid::regprocedure as signature from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proowner = (select oid from pg_roles where rolname = current_user)
            and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass
              and d.objid = p.oid and d.deptype = 'e')
        loop
          execute format('revoke all on routine %s from public', routine.signature);
          for api_role in select rolname from pg_roles where rolname in ('anon', 'authenticated') loop
            execute format('revoke all on routine %s from %I', routine.signature, api_role);
          end loop;
        end loop;

        alter default privileges in schema public revoke all on tables from public;
        alter default privileges in schema public revoke all on sequences from public;
        -- Global default EXECUTE cannot be revoked per schema. Schema USAGE
        -- protects future routines without changing defaults in unrelated schemas.
        for api_role in select rolname from pg_roles where rolname in ('anon', 'authenticated') loop
          execute format('revoke all on schema public from %I', api_role);
          execute format('alter default privileges in schema public revoke all on tables from %I', api_role);
          execute format('alter default privileges in schema public revoke all on sequences from %I', api_role);
          execute format('alter default privileges in schema public revoke all on functions from %I', api_role);
          if has_schema_privilege(api_role, 'public', 'USAGE')
            or has_schema_privilege(api_role, 'public', 'CREATE') then
            raise exception 'Public API role has inherited schema access; review role membership before hardening';
          end if;
        end loop;
      end
    $hardening$;`);
  }

  override async down(): Promise<void> {
    throw new Error(
      "Database access hardening cannot be reversed automatically. Restore only explicitly reviewed backend grants.",
    );
  }
}
