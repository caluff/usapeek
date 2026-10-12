const { existsSync } = require("node:fs")

const rejectUnsafeEnvironment = () => {
  throw new Error("Integration tests require isolated localhost PostgreSQL:55432 and TLS Redis:56379/15; shared development configuration is not allowed.")
}

if (process.env.NODE_ENV !== "test" || process.env.DB_HOST !== "localhost" ||
    process.env.DB_PORT !== "55432" || process.env.DB_USERNAME !== "closure_test" ||
    !process.env.DB_PASSWORD || process.env.PGSSLMODE !== "require" ||
    !process.env.NODE_EXTRA_CA_CERTS || !existsSync(process.env.NODE_EXTRA_CA_CERTS) ||
    process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0" ||
    process.env.DB_TEMP_NAME || process.env.MEDUSA_DB_SCHEMA ||
    (process.env.DB_WAITINGROOM_DATABASE && process.env.DB_WAITINGROOM_DATABASE !== "postgres")) {
  rejectUnsafeEnvironment()
}

let database
let redis
try {
  database = new URL(process.env.DATABASE_URL || "invalid:")
  redis = new URL(process.env.REDIS_URL || "invalid:")
  if (!["postgres:", "postgresql:"].includes(database.protocol) ||
      database.hostname !== "localhost" || database.port !== "55432" ||
      database.pathname === "/" || !database.pathname || database.search || database.hash ||
      decodeURIComponent(database.username) !== "closure_test" ||
      decodeURIComponent(database.password) !== process.env.DB_PASSWORD ||
      redis.protocol !== "rediss:" || redis.hostname !== "localhost" ||
      redis.port !== "56379" || redis.pathname !== "/15" || redis.search || redis.hash ||
      redis.username !== "closure" || !redis.password) {
    rejectUnsafeEnvironment()
  }
} catch {
  rejectUnsafeEnvironment()
}

// Preserve explicit provider opt-out when Medusa later loads the root .env.
for (const key of [
  "STRIPE_API_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PAYOUT_WEBHOOK_SECRET",
  "ALGOLIA_APP_ID", "ALGOLIA_API_KEY", "ALGOLIA_PRODUCT_INDEX",
  "SUPABASE_S3_ENDPOINT", "SUPABASE_S3_REGION", "SUPABASE_S3_ACCESS_KEY_ID",
  "SUPABASE_S3_SECRET_ACCESS_KEY", "SUPABASE_STORAGE_BUCKET",
  "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_CALLBACK_URL",
  "RESEND_API_KEY", "RESEND_FROM_EMAIL", "AUTH_EMAIL_FROM",
]) {
  if (process.env[key]?.trim()) rejectUnsafeEnvironment()
  process.env[key] = " "
}
process.env.AUTH_EMAIL_ENABLED = "false"
process.env.STRIPE_AUTOMATIC_JOBS_ENABLED = "false"
process.env.STRIPE_AUTOMATIC_SETTLEMENT_ENABLED = "false"

const { MetadataStorage } = require("@medusajs/framework/mikro-orm/core")

MetadataStorage.clear()
