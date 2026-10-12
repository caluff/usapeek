// Read-only diagnostic: does not bootstrap Medusa, call its initializer, or connect to Redis.
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");
const { parse } = require("dotenv");
const { SELLER_ROLES } = require("../node_modules/@mercurjs/core/.medusa/server/src/modules/seller/utils/ensure-seller-default-roles.js");

async function main() {
  const environment = parse(readFileSync(path.resolve(__dirname, "../../../.env")));
  const databaseUrl = process.env.DATABASE_URL || environment.DATABASE_URL;
  if (!databaseUrl) throw new Error("configuration_missing");
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 10000,
    statement_timeout: 10000,
    options: "-c default_transaction_read_only=on",
    application_name: "vendor-readiness-read-only-profile",
  });
  const connectedAt = performance.now();
  try {
    await client.connect();
    console.log(JSON.stringify({ stage: "connect", elapsedMs: Math.round(performance.now() - connectedAt) }));
    await client.query("BEGIN READ ONLY");
    const roleIds = SELLER_ROLES.map((role) => role.id);
    const reads = [
      ["roles", "SELECT * FROM rbac_role WHERE deleted_at IS NULL AND id = ANY($1::text[])", [roleIds]],
      ["policies_full", "SELECT * FROM rbac_policy WHERE deleted_at IS NULL", []],
      ["bindings_full", "SELECT * FROM rbac_role_policy WHERE deleted_at IS NULL AND role_id = ANY($1::text[])", [roleIds]],
      ["policies_projected", "SELECT id, key FROM rbac_policy WHERE deleted_at IS NULL", []],
      ["bindings_projected", "SELECT role_id, policy_id FROM rbac_role_policy WHERE deleted_at IS NULL AND role_id = ANY($1::text[])", [roleIds]],
    ];
    const results = new Map();
    for (const sample of [1, 2]) {
      for (const [stage, text, values] of reads) {
        const startedAt = performance.now();
        const response = await client.query(text, values);
        results.set(stage, response.rows);
        console.log(JSON.stringify({
          sample,
          stage,
          elapsedMs: Math.round(performance.now() - startedAt),
          rows: response.rowCount,
          jsonBytes: Buffer.byteLength(JSON.stringify(response.rows)),
        }));
      }
    }
    const roles = new Set(results.get("roles").map((role) => role.id));
    const policies = results.get("policies_projected");
    const bindings = new Set(results.get("bindings_projected").map((binding) => `${binding.role_id}:${binding.policy_id}`));
    let absentDefaultBindings = 0;
    for (const role of SELLER_ROLES) {
      for (const policy of policies) {
        if ((role.policyKeys === "*" || role.policyKeys.includes(policy.key)) && !bindings.has(`${role.id}:${policy.id}`)) absentDefaultBindings++;
      }
    }
    console.log(JSON.stringify({
      stage: "diagnostic_only",
      missingRoles: roleIds.filter((id) => !roles.has(id)).length,
      absentDefaultBindings,
      interpretation: "Absence can mean intentional revocation or incomplete setup; no grant is authorized or performed.",
    }));
  } finally {
    try { await client.query("ROLLBACK"); } finally { await client.end(); }
  }
}

main().catch((error) => {
  // Connection errors may contain credentials or infrastructure hostnames.
  console.error(JSON.stringify({ stage: "failed", code: /^[A-Z0-9_]{2,40}$/.test(error.code || "") ? error.code : "PROFILE_FAILED" }));
  process.exitCode = 1;
});
