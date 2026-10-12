/** Owns a random local database/template; never run against a shared instance. */
import { randomUUID } from "node:crypto";
import { Client } from "@medusajs/framework/pg";
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import type { ICustomerModuleService } from "@medusajs/framework/types";

if (process.env.DATABASE_ACCESS_TESTS !== "disposable-local") {
  describe.skip("database hardening via Medusa runner (opt in with disposable-local)", () => {
    it("requires isolated PostgreSQL and Redis", () => {});
  });
} else {
  if (
    process.env.NODE_ENV !== "test" ||
    process.env.DB_HOST !== "localhost" ||
    !process.env.DB_PORT ||
    !process.env.DB_USERNAME ||
    !process.env.DB_PASSWORD ||
    process.env.PGSSLMODE !== "require" ||
    process.env.DB_TEMP_NAME ||
    process.env.MEDUSA_DB_SCHEMA
  ) {
    throw new Error(
      "This suite requires dedicated localhost PostgreSQL with TLS and owns its database names.",
    );
  }
  const redis = new URL(process.env.REDIS_URL || "invalid:");
  if (
    redis.protocol !== "rediss:" ||
    redis.hostname !== "localhost" ||
    !redis.username ||
    !redis.password ||
    !/^\/(?:[1-9]|1[0-5])$/.test(redis.pathname)
  ) {
    throw new Error(
      "Use a dedicated localhost TLS Redis instance and a nonzero database.",
    );
  }
  for (const name of [
    "STRIPE_API_KEY",
    "RESEND_API_KEY",
    "ALGOLIA_API_KEY",
    "SUPABASE_S3_ACCESS_KEY_ID",
  ]) {
    if (process.env[name]?.trim())
      throw new Error(
        "External providers must be disabled for database access tests.",
      );
  }
  const dbName = `closure_schema_${randomUUID().replaceAll("-", "")}`;
  process.env.DATABASE_URL = `postgres://${encodeURIComponent(process.env.DB_USERNAME)}:${encodeURIComponent(process.env.DB_PASSWORD)}@localhost:${process.env.DB_PORT}/${dbName}`;
  process.env.AUTH_EMAIL_ENABLED = "false";
  jest.setTimeout(180_000);

  medusaIntegrationTestRunner({
    inApp: true,
    dbName,
    hooks: {
      beforeServerStart: async (container) => {
        const config = container.resolve(
          ContainerRegistrationKeys.CONFIG_MODULE,
        );
        if (
          new URL(config.projectConfig.databaseUrl!).pathname !== `/${dbName}`
        ) {
          throw new Error(
            "Application database differs from this disposable runner's database.",
          );
        }
        const admin = new Client({
          host: "localhost",
          port: Number(process.env.DB_PORT),
          user: process.env.DB_USERNAME,
          password: process.env.DB_PASSWORD,
          database: "postgres",
          ssl: { rejectUnauthorized: true },
        });
        await admin.connect();
        try {
          // These inert roles belong only to the disposable test cluster.
          for (const role of ["anon", "authenticated"]) {
            const existing = await admin.query(
              "select 1 from pg_roles where rolname = $1",
              [role],
            );
            if (!existing.rowCount)
              await admin.query(`create role ${role} nologin`);
          }
        } finally {
          await admin.end();
        }
      },
    },
    testSuite: ({ api, getContainer }) => {
      it("starts the API and preserves native customer CRUD after all migrations", async () => {
        expect((await api.get("/health")).status).toBe(200);
        const customers = getContainer().resolve<ICustomerModuleService>(
          Modules.CUSTOMER,
        );
        const customer = await customers.createCustomers({
          email: `hardening-${randomUUID()}@example.invalid`,
          first_name: "Disposable",
        });
        await customers.updateCustomers(customer.id, { first_name: "Updated" });
        expect((await customers.retrieveCustomer(customer.id)).first_name).toBe(
          "Updated",
        );
        await customers.deleteCustomers(customer.id);
        await expect(customers.retrieveCustomer(customer.id)).rejects.toThrow();
      });

      it("denies direct API-role access to native and future tables in the fully migrated schema", async () => {
        const client = new Client({
          host: "localhost",
          port: Number(process.env.DB_PORT),
          user: process.env.DB_USERNAME,
          password: process.env.DB_PASSWORD,
          database: dbName,
          ssl: { rejectUnauthorized: true },
        });
        await client.connect();
        try {
          const roles = await client.query(
            "select rolname from pg_roles where rolname in ('anon','authenticated')",
          );
          expect(roles.rows).toHaveLength(2);
          await client.query(
            "create table public.closure_future_record (id integer)",
          );
          for (const role of ["anon", "authenticated"]) {
            const result = await client.query(
              `select has_schema_privilege($1,'public','USAGE') as schema,
              has_table_privilege($1,'public.customer','SELECT') as customer,
              has_table_privilege($1,'public.payment','UPDATE') as payment,
              has_table_privilege($1,'public.auth_identity','SELECT') as auth,
              has_table_privilege($1,'public.closure_future_record','SELECT') as future`,
              [role],
            );
            expect(result.rows).toEqual([
              {
                schema: false,
                customer: false,
                payment: false,
                auth: false,
                future: false,
              },
            ]);
            await client.query(`set role ${role}`);
            await expect(
              client.query("select * from public.customer limit 0"),
            ).rejects.toMatchObject({ code: "42501" });
            await client.query("reset role");
          }
        } finally {
          await client.end();
        }
      });
    },
  });
}
