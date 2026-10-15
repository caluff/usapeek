import { assertStripePlatformAccount, isStripeLivemode } from "../stripe-mode";
import { MathBN, MedusaError } from "@medusajs/framework/utils";
import { createStripeClient } from "../stripe-client";
import { getStripeConnectConfiguration } from "../stripe-connect-configuration";
import { readStripeFactPages } from "./provider-facts";

function financeConfiguration() {
  const configuration = getStripeConnectConfiguration();
  if (!configuration)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "No está configurado el proveedor de pagos.",
    );
  if (configuration.jobsEnabled)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Las liquidaciones automáticas deben permanecer desactivadas hasta completar la conciliación de reembolsos.",
    );
  return configuration;
}

/** Legacy operational QA uses this synchronous factory in TEST only. */
export function financeStripeClient() {
  const configuration = financeConfiguration();
  if (configuration.mode !== "test")
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "LIVE finance requires a verified platform client.",
    );
  return createStripeClient(configuration.apiKey);
}

export async function verifiedFinanceStripeClient() {
  const configuration = financeConfiguration();
  const stripe = createStripeClient(configuration.apiKey);
  const account = await stripe.accounts.retrieveCurrent();
  assertStripePlatformAccount(account.id);
  return stripe;
}

export async function readFinanceProvider(paymentIntentId: string) {
  const stripe = await verifiedFinanceStripeClient();
  const [intent, refunds] = await Promise.all([
    stripe.paymentIntents.retrieve(paymentIntentId),
    readStripeFactPages(
      (cursor) =>
        stripe.refunds.list({
          payment_intent: paymentIntentId,
          limit: 100,
          ...(cursor ? { starting_after: cursor } : {}),
        }),
      100,
    ),
  ]);
  if (
    !isStripeLivemode(intent.livemode) ||
    intent.currency !== "usd" ||
    !refunds.complete ||
    refunds.data.some((refund) => refund.status !== "succeeded")
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "El proveedor tiene operaciones pendientes o un pago que requiere conciliación.",
    );
  }
  return { intent, refunds: refunds.data };
}

export function assertProviderBalances(
  provider: Awaited<ReturnType<typeof readFinanceProvider>>,
  captured: number,
  refunded: number,
  releasedRefundIds: string[] = [],
) {
  const providerRefunded = provider.refunds.reduce(
    (sum, refund) =>
      sum + (releasedRefundIds.includes(refund.id) ? 0 : refund.amount),
    0,
  );
  if (releasedRefundIds.length) {
    const released = provider.refunds.filter((refund) =>
      releasedRefundIds.includes(refund.id),
    );
    if (
      released.length !== releasedRefundIds.length ||
      provider.intent.status !== "succeeded" ||
      provider.intent.amount_capturable !== 0 ||
      released.reduce((sum, refund) => sum + refund.amount, 0) !==
        provider.intent.amount - provider.intent.amount_received
    ) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "La liberación de la autorización requiere conciliación.",
      );
    }
  }
  // Stripe records voiding an uncaptured authorization as a Refund too. It is
  // not a refund of captured money: amount_received remains zero.
  const releasedAuthorization =
    captured === 0 &&
    refunded === 0 &&
    provider.intent.status === "canceled" &&
    provider.intent.amount_received === 0 &&
    provider.intent.amount_capturable === 0 &&
    (providerRefunded === 0 ||
      MathBN.eq(providerRefunded, provider.intent.amount));
  if (releasedAuthorization) return;
  // Only Stripe's boundary uses minor units; Medusa amounts remain display units.
  if (
    !MathBN.eq(provider.intent.amount_received, MathBN.mult(captured, 100)) ||
    !MathBN.eq(providerRefunded, MathBN.mult(refunded, 100))
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "El saldo del proveedor no coincide con el registrado. El operador debe conciliar el pago.",
    );
  }
}
