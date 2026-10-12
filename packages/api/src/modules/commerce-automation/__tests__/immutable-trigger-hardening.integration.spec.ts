import { randomUUID } from "node:crypto";
import { Client } from "@medusajs/framework/pg";
import { Migration } from "@medusajs/framework/mikro-orm/migrations";
import { Migration20260919221631 } from "../migrations/Migration20260919221631";
import { Migration20261003061545 } from "../migrations/Migration20261003061545";
import { Migration20261004072026 } from "../migrations/Migration20261004072026";

const enabled = process.env.DATABASE_ACCESS_TESTS === "disposable-local";

if (
  enabled &&
  (process.env.NODE_ENV !== "test" ||
    process.env.DB_HOST !== "localhost" ||
    process.env.DB_PORT !== "55432" ||
    !process.env.DB_USERNAME ||
    !process.env.DB_PASSWORD ||
    process.env.PGSSLMODE !== "require")
) {
  throw new Error("Immutable trigger tests require disposable localhost PostgreSQL with TLS.");
}

(enabled ? describe : describe.skip)("immutable trigger hardening (real PostgreSQL)", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const database = `closure_triggers_${suffix}`;
  const consumer = `closure_trigger_reader_${suffix}`;
  const outsider = `closure_trigger_outsider_${suffix}`;
  let control: Client;
  let client: Client;
  let databaseCreated = false;

  const connection = (name: string) => new Client({
    host: "localhost",
    port: 55432,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: name,
    ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 10_000,
  });

  async function queries(migration: Migration): Promise<string[]> {
    await migration.up();
    return migration.getQueries().map(String);
  }

  const migration = () => new Migration20261004072026(undefined as never, undefined as never);
  async function apply() {
    for (const sql of await queries(migration())) await client.query(sql);
  }

  async function identity() {
    return (await client.query(`select p.oid, p.proname, p.prosrc, p.proowner,
      p.prosecdef, p.prorettype, p.provolatile, p.prolang
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in
      ('reject_finance_sale_snapshot_update','reject_order_completion_update')
      order by p.proname`)).rows;
  }

  async function triggers() {
    return (await client.query(`select oid, tgrelid, tgfoid, pg_get_triggerdef(oid) as definition
      from pg_trigger where not tgisinternal order by oid`)).rows;
  }

  beforeAll(async () => {
    control = connection("postgres");
    await control.connect();
    expect((await control.query("select ssl from pg_stat_ssl where pid=pg_backend_pid()")).rows[0].ssl).toBe(true);
    await control.query(`create role "${consumer}" nologin nosuperuser nobypassrls`);
    await control.query(`create role "${outsider}" nologin nosuperuser nobypassrls`);
    await control.query(`create database "${database}"`);
    databaseCreated = true;
    client = connection(database);
    await client.connect();
    await client.query(`create table public.finance_sale_snapshot (id text primary key, value text);
      create table public.order_completion (id text primary key, value text);
      create table public.unrelated_record (id text primary key, value text);
      insert into public.finance_sale_snapshot values ('snapshot','original');
      insert into public.order_completion values ('clock','original');
      create function public.unrelated_function() returns integer language sql as 'select 1';
      grant usage on schema public to "${consumer}", "${outsider}";
      grant select, update on public.finance_sale_snapshot, public.order_completion to "${consumer}";`);

    // Execute the actual historical function/trigger definitions, not copies.
    for (const original of [
      new Migration20260919221631(undefined as never, undefined as never),
      new Migration20261003061545(undefined as never, undefined as never),
    ]) {
      for (const sql of await queries(original)) {
        if (/^create (function|trigger) /i.test(sql.trim())) await client.query(sql);
      }
    }
    await client.query(`revoke execute on function public.reject_order_completion_update() from public;
      grant execute on function public.reject_finance_sale_snapshot_update(),
      public.reject_order_completion_update() to "${consumer}";`);
  });

  afterAll(async () => {
    await client?.end();
    if (control) {
      try {
        if (databaseCreated) await control.query(`drop database "${database}"`);
        await control.query(`drop role if exists "${consumer}", "${outsider}"`);
      } finally {
        await control.end();
      }
    }
  });

  it("pins both paths, removes only snapshot PUBLIC execution and safely replays", async () => {
    const beforeIdentity = await identity();
    const beforeTriggers = await triggers();
    const defaults = (await client.query("select * from pg_default_acl order by oid")).rows;
    const clockAcl = (await client.query("select proacl::text as acl from pg_proc where oid='public.reject_order_completion_update()'::regprocedure")).rows;
    expect((await client.query("select has_function_privilege($1,'public.reject_finance_sale_snapshot_update()','EXECUTE') as allowed", [outsider])).rows[0].allowed).toBe(true);
    await apply();
    await apply();
    expect(await identity()).toEqual(beforeIdentity);
    expect(await triggers()).toEqual(beforeTriggers);
    expect((await client.query("select * from pg_default_acl order by oid")).rows).toEqual(defaults);
    expect((await client.query("select proacl::text as acl from pg_proc where oid='public.reject_order_completion_update()'::regprocedure")).rows).toEqual(clockAcl);
    const state = (await client.query(`select p.proname,
      (select option_value from pg_options_to_table(p.proconfig) where option_name='search_path') as search_path,
      exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        where a.grantee=0 and a.privilege_type='EXECUTE') as public_execute,
      has_function_privilege(current_user,p.oid,'EXECUTE') as owner_execute,
      has_function_privilege($1,p.oid,'EXECUTE') as consumer_execute,
      has_function_privilege($2,p.oid,'EXECUTE') as outsider_execute
      from pg_proc p where p.oid in ('public.reject_finance_sale_snapshot_update()'::regprocedure,
        'public.reject_order_completion_update()'::regprocedure) order by p.proname`, [consumer, outsider])).rows;
    expect(state).toHaveLength(2);
    for (const row of state) expect(row).toMatchObject({
      search_path: '""', public_execute: false, owner_execute: true,
      consumer_execute: true, outsider_execute: false,
    });
    expect((await client.query("select has_function_privilege($1,'public.unrelated_function()','EXECUTE') as allowed", [outsider])).rows[0].allowed).toBe(true);
  });

  it("preserves both immutable trigger errors and unrelated backend CRUD", async () => {
    await apply();
    await client.query(`set role "${consumer}"; set search_path=pg_catalog`);
    try {
      await expect(client.query("update public.finance_sale_snapshot set value='changed' where id='snapshot'")).rejects.toMatchObject({
        code: "P0001", message: "Original financial snapshots are immutable; record a separate adjustment.",
      });
      await expect(client.query("update public.order_completion set value='changed' where id='clock'")).rejects.toMatchObject({
        code: "P0001", message: "Order completion clocks and bindings are immutable.",
      });
      for (const table of ["finance_sale_snapshot", "order_completion"]) {
        expect((await client.query(`select value from public.${table}`)).rows).toEqual([{ value: "original" }]);
      }
    } finally {
      await client.query("reset role; reset search_path");
    }
    await client.query("insert into public.unrelated_record values ('backend','created'); update public.unrelated_record set value='updated' where id='backend'");
    expect((await client.query("select value from public.unrelated_record where id='backend'")).rows).toEqual([{ value: "updated" }]);
    expect((await client.query("delete from public.unrelated_record where id='backend'")).rowCount).toBe(1);
  });

  it("refuses an automatic rollback that would reopen execution", async () => {
    await expect(migration().down()).rejects.toThrow("cannot be reversed automatically");
  });
});
