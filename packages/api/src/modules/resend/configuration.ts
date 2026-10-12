import { z } from "@medusajs/framework/zod";
import { MedusaError } from "@medusajs/framework/utils";
import { getEmailSender } from "../../lib/email-sender";

const senderSchema = z.string().trim().min(1).refine((value) => {
  if (/[\r\n]/.test(value)) return false;
  const address = value.match(/^[^<>]+<([^<>]+)>$/)?.[1] ?? value;
  return z.email().safeParse(address).success;
}, "RESEND_FROM_EMAIL (or AUTH_EMAIL_FROM) must be a single email address, optionally with a display name");

export const resendOptionsSchema = z.object({
  api_key: z.string().regex(/^re_[A-Za-z0-9_-]+$/, "RESEND_API_KEY must be a Resend API key"),
  from: senderSchema,
  production: z.boolean().default(false),
}).refine((options) => {
  const address = options.from.match(/<([^<>]+)>$/)?.[1] ?? options.from;
  const domain = address.split("@")[1]?.toLowerCase() ?? "";
  return !options.production || (domain !== "resend.dev" && !domain.endsWith(".resend.dev"));
}, "RESEND_FROM_EMAIL (or AUTH_EMAIL_FROM) must use a verified domain in production; resend.dev is testing-only");

export type ResendOptions = z.infer<typeof resendOptionsSchema>;

export function getResendConfiguration(environment: NodeJS.ProcessEnv = process.env): ResendOptions | null {
  if (environment.AUTH_EMAIL_ENABLED !== "true") return null;
  const result = resendOptionsSchema.safeParse({
    api_key: environment.RESEND_API_KEY,
    from: getEmailSender(environment),
    production: environment.NODE_ENV === "production",
  });
  if (!result.success) {
    // Do not include validation input: it contains the provider credential.
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "[resend] AUTH_EMAIL_ENABLED=true requires a valid RESEND_API_KEY and RESEND_FROM_EMAIL (or AUTH_EMAIL_FROM); production requires a verified sender domain other than resend.dev");
  }
  return result.data;
}
