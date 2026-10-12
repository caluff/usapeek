import { createHmac, timingSafeEqual } from "node:crypto";
import { MedusaError } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";

export const ORDER_TRACKING_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;
export const ORDER_TRACKING_TOKEN_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/;
const PURPOSE = "usapeek:order-tracking:v1";
const claimsSchema = z.strictObject({
  v: z.literal(1),
  order_id: z.string().regex(/^order_[a-zA-Z0-9]+$/),
  recipient: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  exp: z.number().int().positive(),
});

type TrackingEnvironment = Partial<Record<"JWT_SECRET" | "STOREFRONT_URL", string>>;
type TrackingOrder = { id: string; email: string };

function signingKey(environment: TrackingEnvironment) {
  if (!environment.JWT_SECRET) {
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Order tracking signing is not configured");
  }
  // Derive a purpose-specific key; a tracking token cannot be used as an auth JWT.
  return createHmac("sha256", environment.JWT_SECRET).update(PURPOSE).digest();
}

function recipientDigest(email: string, environment: TrackingEnvironment) {
  return createHmac("sha256", signingKey(environment))
    .update(`recipient:${email.trim().toLowerCase()}`).digest("base64url");
}

function signature(payload: string, environment: TrackingEnvironment) {
  return createHmac("sha256", signingKey(environment)).update(payload).digest();
}

export function invalidOrderTrackingLink(): never {
  throw new MedusaError(MedusaError.Types.NOT_FOUND, "El enlace de seguimiento no es válido o ha vencido.");
}

export function createOrderTrackingToken(
  order: TrackingOrder,
  environment: TrackingEnvironment = process.env,
  issuedAt: string | Date | number = Date.now(),
) {
  const timestamp = typeof issuedAt === "number" ? issuedAt : new Date(issuedAt).getTime();
  const claims = claimsSchema.parse({
    v: 1,
    order_id: order.id,
    recipient: recipientDigest(z.email().parse(order.email), environment),
    exp: Math.floor(timestamp / 1000) + ORDER_TRACKING_MAX_AGE_SECONDS,
  });
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${signature(payload, environment).toString("base64url")}`;
}

export function verifyOrderTrackingToken(
  token: string,
  environment: TrackingEnvironment = process.env,
  now = Date.now(),
) {
  if (token.length > 2048 || !ORDER_TRACKING_TOKEN_PATTERN.test(token)) invalidOrderTrackingLink();
  const [payload, encodedSignature] = token.split(".");
  const received = Buffer.from(encodedSignature, "base64url");
  const expected = signature(payload, environment);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)
    || received.toString("base64url") !== encodedSignature) invalidOrderTrackingLink();
  let decoded: unknown;
  try {
    const bytes = Buffer.from(payload, "base64url");
    if (bytes.toString("base64url") !== payload) invalidOrderTrackingLink();
    decoded = JSON.parse(bytes.toString("utf8"));
  } catch {
    invalidOrderTrackingLink();
  }
  const result = claimsSchema.safeParse(decoded);
  if (!result.success || result.data.exp <= Math.floor(now / 1000)) invalidOrderTrackingLink();
  return result.data;
}

export function assertTrackingRecipient(
  recipient: string,
  email: string | null | undefined,
  environment: TrackingEnvironment = process.env,
) {
  if (!email || recipient !== recipientDigest(email, environment)) invalidOrderTrackingLink();
}

export function buildOrderTrackingUrl(
  order: TrackingOrder,
  environment: TrackingEnvironment = process.env,
  issuedAt: string | Date | number = Date.now(),
) {
  let base: URL;
  try {
    base = new URL(environment.STOREFRONT_URL ?? "");
    if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid storefront origin");
    }
  } catch {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "[order-email] STOREFRONT_URL must be a valid public URL");
  }
  const url = new URL("/orders/track", base.origin);
  // URL fragments stay in the browser and are omitted from HTTP access logs
  // and referrers. The storefront sends the token in a POST body instead.
  url.hash = new URLSearchParams({ token: createOrderTrackingToken(order, environment, issuedAt) }).toString();
  return url.toString();
}
