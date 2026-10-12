import { randomUUID } from "node:crypto";
import { Client } from "@medusajs/framework/pg";
import { Migration20260919120000 } from "../migrations/Migration20260919120000";

const enabled = process.env.DATABASE_ACCESS_TESTS === "disposable-local";

if (
  enabled &&
  (process.env.NODE_ENV !== "test" ||
    process.env.DB_HOST !== "localhost" ||
    !process.env.DB_PORT ||
    !process.env.DB_USERNAME ||
    !process.env.DB_PASSWORD ||
    process.env.PGSSLMODE !== "require")
) {
  throw new Error(
    "Database access tests require explicit disposable localhost PostgreSQL with TLS.",
  );
}

(enabled ? describe : describe.skip)(
  "backend-only database access (real PostgreSQL)",
  () => {
    const suffix = randomUUID().replaceAll("-", "");
    const backend = `closure_backend_${suffix}`;
    const other = `closure_other_${suffix}`;
    const worker = `closure_worker_${suffix}`;
    let control: Client;
    let client: Client;
    let database: string;
    let statements: string[];

    const connection = (name: string) =>
      new Client({
        host: "localhost",
        port: Number(process.env.DB_PORT),
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: name,
        ssl: { rejectUnauthorized: true },
        connectionTimeoutMillis: 10_000,
      });

    beforeAll(async () => {
      control = connection("postgres");
      await control.connect();
      expect(
        (
          await control.query(
            "select ssl from pg_stat_ssl where pid = pg_backend_pid()",
          )
        ).rows[0].ssl,
      ).toBe(true);
      await control.query(
        `create role "${backend}" nologin nosuperuser nobypassrls`,
      );
      await control.query(
        `create role "${other}" nologin nosuperuser nobypassrls`,
      );
      await control.query(
        `create role "${worker}" nologin nosuperuser bypassrls`,
      );
      await control.query(`do $$ begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    end $$`);
      // Collect the actual migration SQL; all assertions execute it against PostgreSQL.
      const migration = new Migration20260919120000(
        undefined as never,
        undefined as never,
      );
      await migration.up();
      statements = migration.getQueries().map(String);
    });

    beforeEach(async () => {
      database = `closure_access_${randomUUID().replaceAll("-", "")}`;
      await control.query(`create database "${database}" owner "${backend}"`);
      client = connection(database);
      await client.connect();
      await client.query(`set role "${backend}"`);
      await client.query(`grant usage on schema public to anon, authenticated;
      create table customer (id integer primary key, secret text);
      insert into customer values (1, 'fixture');
      create table payment (id integer primary key);
      create sequence payment_sequence;
      create view customer_view as select * from customer;
      create function customer_secret() returns text language sql security definer
        set search_path=public as 'select secret from customer limit 1';
      grant all on all tables in schema public to anon, authenticated;
      grant all on all sequences in schema public to anon, authenticated;
      grant execute on all functions in schema public to anon, authenticated;
      alter default privileges in schema public grant all on tables to anon, authenticated;
      alter default privileges in schema public grant all on sequences to anon, authenticated;
      alter default privileges in schema public grant execute on functions to anon, authenticated;`);
    });

    afterEach(async () => {
      await client?.end();
      if (database && /^closure_access_[a-f0-9]{32}$/.test(database)) {
        await control.query(`drop database "${database}"`);
      }
    });

    afterAll(async () => {
      if (control) {
        await control.query(
          `drop role if exists "${backend}", "${other}", "${worker}"`,
        );
        await control.end();
      }
    });

    async function apply() {
      for (const sql of statements) await client.query(sql);
    }

    async function assertPublicDenied() {
      for (const role of ["anon", "authenticated"]) {
        await client.query("reset role");
        await client.query(`set role ${role}`);
        for (const sql of [
          "select * from public.customer",
          "update public.customer set secret='changed' where id=1",
          "select * from public.customer_view",
          "select public.customer_secret()",
          "select nextval('public.payment_sequence')",
        ]) {
          await expect(client.query(sql)).rejects.toMatchObject({
            code: "42501",
          });
        }
      }
      await client.query("reset role");
      await client.query(`set role "${backend}"`);
    }

    it("denies table/view/routine/sequence access, keeps owner CRUD and protects future objects", async () => {
      expect(
        (
          await client.query(
            "select has_table_privilege('anon','customer','SELECT') as allowed",
          )
        ).rows[0].allowed,
      ).toBe(true);
      await apply();
      await apply(); // Repeated deployment is safe.
      await assertPublicDenied();
      expect(
        (await client.query("select secret from customer where id=1")).rows,
      ).toEqual([{ secret: "fixture" }]);
      await client.query(
        "insert into customer values (2,'backend'); update customer set secret='updated' where id=2; delete from customer where id=2",
      );
      expect(
        (
          await client.query(
            "select relrowsecurity from pg_class where oid='customer'::regclass",
          )
        ).rows[0].relrowsecurity,
      ).toBe(true);
      await client.query(`create table future_finance (id integer); create sequence future_sequence;
      create function future_secret() returns text language sql security definer
        set search_path=public as 'select secret from customer limit 1';
      create procedure future_change() language sql security definer
        set search_path=public as 'update customer set secret=''changed''';`);
      for (const role of ["anon", "authenticated"]) {
        const access = await client.query(
          `select
        has_table_privilege($1,'future_finance','SELECT') as readable,
        has_table_privilege($1,'future_finance','UPDATE') as writable,
        has_sequence_privilege($1,'future_sequence','USAGE') as sequence,
        has_schema_privilege($1,'public','USAGE') as schema`,
          [role],
        );
        expect(access.rows).toEqual([
          { readable: false, writable: false, sequence: false, schema: false },
        ]);
        await client.query("reset role");
        await client.query(`set role ${role}`);
        await expect(
          client.query("select public.future_secret()"),
        ).rejects.toMatchObject({ code: "42501" });
        await expect(
          client.query("call public.future_change()"),
        ).rejects.toMatchObject({ code: "42501" });
        await client.query("reset role");
        await client.query(`set role "${backend}"`);
      }
    });

    it("preserves explicitly authorized backend consumers and other schemas", async () => {
      await client.query(`grant usage on schema public to "${worker}";
      grant select, update on customer to "${worker}";
      create schema unrelated;
      grant usage on schema unrelated to anon;
      create table unrelated.visible (id integer);
      grant select on unrelated.visible to anon;`);
      await apply();
      await client.query("reset role");
      await client.query(`set role "${worker}"`);
      expect(
        (await client.query("select secret from customer where id=1")).rows,
      ).toEqual([{ secret: "fixture" }]);
      await client.query("update customer set secret='worker' where id=1");
      await client.query("reset role");
      await client.query(`set role "${backend}"`);
      expect(
        (
          await client.query(
            "select has_table_privilege('anon','unrelated.visible','SELECT') as allowed",
          )
        ).rows[0].allowed,
      ).toBe(true);
    });

    it("requires an explicit RLS policy for non-owner backend consumers before changing access", async () => {
      await client.query(
        `grant usage on schema public to "${other}"; grant select on customer to "${other}"`,
      );
      await expect(apply()).rejects.toThrow(
        "Unreviewed non-owner backend grant",
      );
      expect(
        (
          await client.query(
            "select relrowsecurity from pg_class where oid='customer'::regclass",
          )
        ).rows[0].relrowsecurity,
      ).toBe(false);
    });

    it("rolls back all changes when inherited public-role access fails the final check", async () => {
      await client.query(`grant usage on schema public to "${other}"`);
      await client.query("reset role");
      await client.query(`grant "${other}" to anon`);
      try {
        await client.query(`set role "${backend}"`);
        await expect(apply()).rejects.toThrow(
          "Public API role has inherited schema access",
        );
        expect(
          (
            await client.query(
              "select has_table_privilege('anon','customer','SELECT') as allowed",
            )
          ).rows[0].allowed,
        ).toBe(true);
        expect(
          (
            await client.query(
              "select relrowsecurity from pg_class where oid='customer'::regclass",
            )
          ).rows[0].relrowsecurity,
        ).toBe(false);
      } finally {
        await client.query("reset role");
        await client.query(`revoke "${other}" from anon`);
      }
    });

    it("fails atomically for an unreviewed owner instead of mutating its permissions", async () => {
      await client.query("reset role");
      await client.query(
        `create table public.external_data (id integer); alter table public.external_data owner to "${other}"`,
      );
      await client.query(`set role "${backend}"`);
      await expect(apply()).rejects.toThrow("Unreviewed object owner");
      expect(
        (
          await client.query(
            "select has_table_privilege('anon','customer','SELECT') as allowed",
          )
        ).rows[0].allowed,
      ).toBe(true);
      expect(
        (
          await client.query(
            "select relrowsecurity from pg_class where oid='customer'::regclass",
          )
        ).rows[0].relrowsecurity,
      ).toBe(false);
    });

    it("refuses an automatic rollback that would reopen public access", async () => {
      const migration = new Migration20260919120000(
        undefined as never,
        undefined as never,
      );
      await expect(migration.down()).rejects.toThrow(
        "cannot be reversed automatically",
      );
    });
  },
);
