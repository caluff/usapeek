import { MedusaError } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";

export const stripeModeSchema = z.enum(["test", "live"]);
export type StripeMode = z.infer<typeof stripeModeSchema>;

export function getStripeMode(
  environment: NodeJS.ProcessEnv = process.env,
): StripeMode {
  const parsed = stripeModeSchema.safeParse(environment.STRIPE_MODE ?? "test");
  if (!parsed.success)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "[stripe] STRIPE_MODE must be test or live.",
    );
  return parsed.data;
}

export function getStripeApiKeyMode(apiKey: string): StripeMode {
  const matched = /^sk_(test|live)_[A-Za-z0-9]+$/.exec(apiKey);
  if (!matched)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "[stripe] Configure a valid secret API key for the selected mode.",
    );
  return stripeModeSchema.parse(matched[1]);
}

export function isStripeLivemode(
  value: unknown,
  mode: StripeMode = getStripeMode(),
): boolean {
  return value === (mode === "live");
}

export function assertStripePlatformAccount(
  accountId: string,
  environment: NodeJS.ProcessEnv = process.env,
): void {
  const expected = environment.STRIPE_ACCOUNT_ID?.trim();
  if (
    (getStripeMode(environment) === "live" && !expected) ||
    (expected &&
      (!/^acct_[A-Za-z0-9]+$/.test(expected) || accountId !== expected))
  )
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "[stripe] The platform account does not match STRIPE_ACCOUNT_ID.",
    );
}
