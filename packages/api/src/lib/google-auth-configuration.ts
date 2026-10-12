import { MedusaError } from "@medusajs/framework/utils";

export function getGoogleAuthConfiguration(env = process.env) {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  const callbackUrl = env.GOOGLE_CALLBACK_URL?.trim();
  if (!clientId && !clientSecret && !callbackUrl) return undefined;
  if (!clientId || !clientSecret || !callbackUrl) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "[configuration] Google authentication requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_CALLBACK_URL");
  }
  let callback: URL;
  try { callback = new URL(callbackUrl); } catch {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "[configuration] GOOGLE_CALLBACK_URL must be an absolute URL");
  }
  if (callback.protocol !== "https:" && !(callback.protocol === "http:" && callback.hostname === "localhost")) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "[configuration] GOOGLE_CALLBACK_URL must use HTTPS (HTTP is allowed for localhost)");
  }
  return { clientId, clientSecret, callbackUrl };
}
