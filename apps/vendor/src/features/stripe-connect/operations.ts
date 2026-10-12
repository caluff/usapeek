import type { HttpTypes } from "@mercurjs/types";
import { scopedClient, type AuthorizeVendor } from "../workspace/operations";

export async function refreshStripeAccount(authorize: AuthorizeVendor) {
  const client = scopedClient(await authorize());
  return client.post<{
    payout_account: Pick<
      HttpTypes.VendorPayoutAccountResponse["payout_account"],
      "id" | "status"
    >;
  }>("/vendor/stripe-account-refresh", {});
}

export function stripeOnboardingUrl(value: unknown): string {
  if (typeof value !== "string")
    throw new Error("Stripe no devolvió un enlace de configuración válido.");
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "connect.stripe.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new Error("Stripe no devolvió un enlace de configuración válido.");
  }
  return url.href;
}

export async function beginStripeOnboarding(authorize: AuthorizeVendor) {
  const client = scopedClient(await authorize());
  const response = await client.get<HttpTypes.VendorPayoutAccountListResponse>(
    "/vendor/payout-accounts",
    { limit: 2, fields: "id,status" },
  );
  if (response.count > 1 || response.payout_accounts.length > 1) {
    throw new Error(
      "Tu tienda tiene más de una cuenta de cobros. El administrador debe revisarla antes de continuar.",
    );
  }
  const account =
    response.payout_accounts[0] ??
    (
      await client.post<HttpTypes.VendorPayoutAccountResponse>(
        "/vendor/payout-accounts",
        { data: { country: "US" } },
      )
    ).payout_account;
  if (account.status === "rejected")
    throw new Error(
      "Stripe rechazó esta cuenta. Contacta al administrador para revisar el caso.",
    );
  const { onboarding } = await client.post<HttpTypes.VendorOnboardingResponse>(
    `/vendor/payout-accounts/${encodeURIComponent(account.id)}/onboarding`,
    // The API supplies the verified account ID and fixed return URLs.
    {},
  );
  return stripeOnboardingUrl(onboarding.data?.url);
}
