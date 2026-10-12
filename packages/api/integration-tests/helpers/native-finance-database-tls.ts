import { existsSync } from "node:fs";
import type { ConfigModule } from "@medusajs/framework/config";
import { MedusaError } from "@medusajs/framework/utils";

function requireLocal(value: unknown): asserts value {
  if (!value)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Finance integration requires its disposable local PostgreSQL database and verified TLS.",
    );
}

/** Medusa 2.18's test runner clears databaseDriverOptions for localhost.
 * Restore verified TLS in beforeServerStart, before its pgConnectionLoader runs.
 */
export function configureNativeFinanceDatabaseTls(
  configuration: Pick<ConfigModule, "projectConfig">,
  expectedDatabaseName: string,
  environment: NodeJS.ProcessEnv = process.env,
): void {
  const project = configuration.projectConfig;
  const target = new URL(project.databaseUrl ?? "invalid:");
  requireLocal(
    environment.NODE_ENV === "test" &&
      environment.DB_HOST === "localhost" &&
      environment.DB_PORT === "55432" &&
      environment.DB_USERNAME &&
      environment.DB_PASSWORD &&
      environment.PGSSLMODE === "require" &&
      environment.NODE_TLS_REJECT_UNAUTHORIZED !== "0" &&
      environment.NODE_EXTRA_CA_CERTS &&
      existsSync(environment.NODE_EXTRA_CA_CERTS) &&
      !environment.DB_TEMP_NAME &&
      !environment.MEDUSA_DB_SCHEMA &&
      (!project.databaseSchema || project.databaseSchema === "public") &&
      /^(?:webhook_test_|closure_finance_durability_|closure_payment_webhook_)[a-f0-9]{32}$/.test(
        expectedDatabaseName,
      ) &&
      ["postgres:", "postgresql:"].includes(target.protocol) &&
      target.hostname === "localhost" &&
      target.port === "55432" &&
      target.pathname === `/${expectedDatabaseName}` &&
      !target.search &&
      !target.hash &&
      decodeURIComponent(target.username) === environment.DB_USERNAME &&
      decodeURIComponent(target.password) === environment.DB_PASSWORD,
  );
  const driver = project.databaseDriverOptions ?? {};
  const connection = driver.connection ?? {};
  requireLocal(typeof driver === "object" && !Array.isArray(driver));
  requireLocal(
    typeof connection === "object" &&
      connection !== null &&
      !Array.isArray(connection),
  );
  const ssl = { rejectUnauthorized: true };
  project.databaseDriverOptions = {
    ...driver,
    // createPgConnection prefers the flat ssl option; module loaders also use
    // connection.ssl. Both must agree, including after the runner override.
    ssl,
    connection: { ...connection, ssl },
  };
}
