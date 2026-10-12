import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { MedusaError } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import { GoogleOneTapLoginInputSchema, GoogleOneTapTransactionResponseSchema, type GoogleOneTapTransactionResponse } from "./contracts";

const PURPOSE = "usapeek:google-one-tap:transaction:v1";
const TRANSACTION_SECONDS = 600;
const ISSUED_AT_SKEW_SECONDS = 60;

const transactionSchema = z.strictObject({
  version: z.literal(1),
  actor_type: z.literal("customer"),
  auth_provider: z.literal("google"),
  client_id: z.string().min(1),
  nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  issued_at: z.number().int().nonnegative(),
  expires_at: z.number().int().positive(),
});
const verifiedClaimsSchema = z.object({
  sub: z.string().min(1).max(255),
  email: z.email(),
  email_verified: z.literal(true),
  iss: z.enum(["accounts.google.com", "https://accounts.google.com"]),
  aud: z.string().min(1),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().positive(),
  nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});

export const invalidGoogleOneTap = () => new MedusaError(MedusaError.Types.UNAUTHORIZED, "No pudimos iniciar sesión con Google. Inténtalo de nuevo.");

function transactionKey(secret: string) {
  if (!secret || secret.length < 32) throw invalidGoogleOneTap();
  return createHmac("sha256", secret).update(PURPOSE).digest();
}

export function createGoogleOneTapTransaction(clientId: string, secret: string, now = Date.now()): GoogleOneTapTransactionResponse {
  const issuedAt = Math.floor(now / 1000);
  const transaction = transactionSchema.parse({
    version: 1, actor_type: "customer", auth_provider: "google",
    client_id: clientId, nonce: randomBytes(32).toString("base64url"),
    issued_at: issuedAt, expires_at: issuedAt + TRANSACTION_SECONDS,
  });
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", transactionKey(secret), iv);
  cipher.setAAD(Buffer.from(PURPOSE));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(transaction), "utf8"), cipher.final()]);
  return GoogleOneTapTransactionResponseSchema.parse({
    client_id: clientId, nonce: transaction.nonce,
    transaction_token: `v1.${iv.toString("base64url")}.${ciphertext.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}`,
    expires_at: new Date(transaction.expires_at * 1000).toISOString(),
  });
}

export function readGoogleOneTapTransaction(token: string, clientId: string, secret: string, now = Date.now()) {
  try {
    if (!GoogleOneTapTransactionResponseSchema.shape.transaction_token.safeParse(token).success) throw invalidGoogleOneTap();
    const [, ivEncoded, ciphertextEncoded, tagEncoded] = token.split(".");
    if (!ivEncoded || !ciphertextEncoded || !tagEncoded || token.split(".").length !== 4 || !token.startsWith("v1.")) throw invalidGoogleOneTap();
    const iv = Buffer.from(ivEncoded, "base64url");
    const ciphertext = Buffer.from(ciphertextEncoded, "base64url");
    const tag = Buffer.from(tagEncoded, "base64url");
    // A different base64 spelling of the same authenticated bytes must never
    // produce a new redemption key for an already consumed transaction.
    if (iv.length !== 12 || tag.length !== 16 || iv.toString("base64url") !== ivEncoded
      || ciphertext.toString("base64url") !== ciphertextEncoded || tag.toString("base64url") !== tagEncoded) throw invalidGoogleOneTap();
    const decipher = createDecipheriv("aes-256-gcm", transactionKey(secret), iv);
    decipher.setAAD(Buffer.from(PURPOSE));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const transaction = transactionSchema.parse(JSON.parse(plaintext.toString("utf8")));
    const seconds = Math.floor(now / 1000);
    if (transaction.client_id !== clientId || transaction.expires_at <= seconds
      || transaction.issued_at > seconds + ISSUED_AT_SKEW_SECONDS
      || transaction.expires_at - transaction.issued_at !== TRANSACTION_SECONDS) throw invalidGoogleOneTap();
    return transaction;
  } catch {
    throw invalidGoogleOneTap();
  }
}

// Called only by the native provider's identity facade after its RS256/JWKS,
// audience and issuer verification succeeded, and before any identity operation.
export function assertVerifiedGoogleOneTapClaims(idToken: string, transactionToken: string, clientId: string, secret: string, now = Date.now()) {
  const parsed = GoogleOneTapLoginInputSchema.safeParse({ id_token: idToken, transaction_token: transactionToken });
  if (!parsed.success) throw invalidGoogleOneTap();
  const transaction = readGoogleOneTapTransaction(transactionToken, clientId, secret, now);
  try {
    const claims = verifiedClaimsSchema.parse(JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8")));
    const seconds = Math.floor(now / 1000);
    const nonce = Buffer.from(claims.nonce);
    const expectedNonce = Buffer.from(transaction.nonce);
    if (claims.aud !== clientId || claims.exp <= seconds || claims.exp <= claims.iat
      || claims.iat > seconds + ISSUED_AT_SKEW_SECONDS
      || nonce.length !== expectedNonce.length || !timingSafeEqual(nonce, expectedNonce)) throw invalidGoogleOneTap();
    return { subject: claims.sub, expires_at: transaction.expires_at };
  } catch {
    throw invalidGoogleOneTap();
  }
}

export function googleOneTapRedemptionKey(transactionToken: string) {
  return `google-one-tap:redeemed:${createHash("sha256").update(transactionToken).digest("hex")}`;
}
