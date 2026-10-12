import type { S3FileServiceOptions } from "@medusajs/framework/types";
import { MedusaError } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";

const storageEnvironmentSchema = z.object({
  SUPABASE_S3_ENDPOINT: z.url(),
  SUPABASE_S3_REGION: z.string().trim().min(1),
  SUPABASE_S3_ACCESS_KEY_ID: z.string().trim().min(1),
  SUPABASE_S3_SECRET_ACCESS_KEY: z.string().trim().min(1),
  SUPABASE_STORAGE_BUCKET: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/),
});

export function getProductImageStorageConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): S3FileServiceOptions | null {
  const keys = Object.keys(storageEnvironmentSchema.shape);
  if (!keys.some((key) => environment[key]?.trim())) return null;

  const result = storageEnvironmentSchema.safeParse(environment);
  const invalid = () =>
    new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "[storage] Configure SUPABASE_S3_ENDPOINT, SUPABASE_S3_REGION, SUPABASE_S3_ACCESS_KEY_ID, SUPABASE_S3_SECRET_ACCESS_KEY and SUPABASE_STORAGE_BUCKET for product images.",
    );
  // Never include validation input or provider credentials in diagnostics.
  if (!result.success) throw invalid();

  const options = result.data;
  const endpoint = new URL(options.SUPABASE_S3_ENDPOINT);
  if (
    endpoint.protocol !== "https:" ||
    !/^[a-z0-9-]+(?:\.storage)?\.supabase\.co$/.test(endpoint.hostname) ||
    endpoint.port ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.pathname.replace(/\/$/, "") !== "/storage/v1/s3"
  )
    throw invalid();

  const publicOrigin = `https://${endpoint.hostname.replace(".storage.supabase.co", ".supabase.co")}`;
  return {
    endpoint: `${endpoint.origin}/storage/v1/s3`,
    region: options.SUPABASE_S3_REGION,
    access_key_id: options.SUPABASE_S3_ACCESS_KEY_ID,
    secret_access_key: options.SUPABASE_S3_SECRET_ACCESS_KEY,
    bucket: options.SUPABASE_STORAGE_BUCKET,
    file_url: `${publicOrigin}/storage/v1/object/public/${options.SUPABASE_STORAGE_BUCKET}`,
    prefix: "products/",
    acl: false,
    additional_client_config: { forcePathStyle: true },
  };
}
