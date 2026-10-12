import { installStripeTransport } from "../../helpers/webhook-stripe-transport";

/** Explicit provider simulation. Only the application, native workflows and PG
 * are real in this suite. This ledger is deliberately independent of the journal. */
export function installFinanceDurabilityStripe() {
  const created = Math.floor(Date.now() / 1000) - 10;
  const refunds: Array<{
    id: string;
    object: "refund";
    amount: number;
    currency: "usd";
    payment_intent: string;
    charge: string;
    created: number;
    metadata: Record<string, string>;
    status: "succeeded";
    reason: null;
    balance_transaction: null;
  }> = [];
  const reversals: Array<{
    id: string;
    object: "transfer_reversal";
    amount: number;
    currency: "usd";
    transfer: string;
    created: number;
    metadata: Record<string, string>;
    balance_transaction: null;
  }> = [];
  const intent = {
    id: "pi_durability",
    object: "payment_intent",
    amount: 10_000,
    amount_received: 0,
    amount_capturable: 10_000,
    currency: "usd",
    livemode: false,
    status: "requires_capture",
    capture_method: "manual",
    latest_charge: "ch_durability",
    client_secret: "pi_durability_secret_fixture",
    metadata: {} as Record<string, string>,
    created,
  };
  let transfer:
    | {
        id: string;
        object: string;
        amount: number;
        amount_reversed: number;
        currency: string;
        livemode: boolean;
        destination: string;
        source_transaction: string;
        transfer_group: string;
        created: number;
        metadata: Record<string, string>;
        balance_transaction: null;
      }
    | undefined;
  const state = {
    refundCreates: 0,
    reversalCreates: 0,
    captureCalls: 0,
    loseRefundResponse: false,
    loseReversalResponse: false,
    hideRefunds: false,
    hideReversals: false,
    expectedRefundAmount: 2_000,
    expectedCaptureAmount: 10_000,
    expectedReversalAmount: 1_840,
  };
  const charge = () => ({
    id: "ch_durability",
    object: "charge",
    amount: 10_000,
    amount_captured: intent.amount_received,
    amount_refunded: refunds.reduce((total, row) => total + row.amount, 0),
    currency: "usd",
    livemode: false,
    paid: true,
    captured: intent.status === "succeeded",
    status: "succeeded",
    payment_intent: intent.id,
    transfer_group: `group_${intent.id}`,
    metadata: intent.metadata,
    created,
    balance_transaction: null,
  });
  const page = (data: unknown[], url: string) => ({
    object: "list",
    data,
    has_more: false,
    url,
  });
  const metadata = (body: URLSearchParams) =>
    Object.fromEntries(
      [...body]
        .filter(([key]) => /^metadata\[[^\]]+\]$/.test(key))
        .map(([key, value]) => [key.slice(9, -1), value]),
    );
  const transport = installStripeTransport((request) => {
    const url = new URL(request.path, "https://api.stripe.com");
    const path = url.pathname;
    const body = new URLSearchParams(request.body);
    const ok = (value: unknown) => ({ statusCode: 200, body: value });
    // A non-retryable error deliberately models an omitted successful provider
    // response; the effect stays in the independent ledger for later inspection.
    const lost = () => ({
      statusCode: 400,
      body: {
        error: {
          type: "invalid_request_error",
          message: "Injected response loss after simulated effect",
        },
      },
    });
    if (request.method === "POST" && path === "/v1/payment_intents") {
      if (
        Number(body.get("amount")) !== 10_000 ||
        body.get("currency") !== "usd"
      )
        throw new Error("Unexpected native payment fixture economics");
      intent.metadata = metadata(body);
      return ok(intent);
    }
    if (
      request.method === "POST" &&
      path === "/v1/payment_intents/pi_durability/capture"
    ) {
      if (
        body.has("amount_to_capture") &&
        Number(body.get("amount_to_capture")) !== state.expectedCaptureAmount
      )
        throw new Error("Unexpected simulated final capture amount");
      state.captureCalls++;
      intent.metadata = { ...intent.metadata, ...metadata(body) };
      intent.status = "succeeded";
      intent.amount_received = state.expectedCaptureAmount;
      intent.amount_capturable = 0;
      return ok(intent);
    }
    if (
      request.method === "GET" &&
      path === "/v1/payment_intents/pi_durability"
    )
      return ok(intent);
    if (request.method === "GET" && path === "/v1/charges/ch_durability")
      return ok(charge());
    if (request.method === "GET" && path === "/v1/account")
      return ok({ id: "acct_durabilityplatform", object: "account" });
    if (request.method === "GET" && path === "/v1/balance")
      return ok({
        object: "balance",
        livemode: false,
        available: [],
        pending: [],
      });
    if (request.method === "POST" && path === "/v1/refunds") {
      state.refundCreates++;
      const value = {
        id: `re_durability_${state.refundCreates}`,
        object: "refund" as const,
        amount: Number(body.get("amount")),
        currency: "usd" as const,
        payment_intent: body.get("payment_intent")!,
        charge: "ch_durability",
        created,
        metadata: metadata(body),
        status: "succeeded" as const,
        reason: null,
        balance_transaction: null,
      };
      if (
        value.amount !== state.expectedRefundAmount ||
        value.payment_intent !== intent.id ||
        !value.metadata.finance_operation_id
      )
        throw new Error("Unexpected simulated refund request");
      refunds.push(value);
      return state.loseRefundResponse ? lost() : ok(value);
    }
    if (request.method === "GET" && path === "/v1/refunds")
      return ok(page(state.hideRefunds ? [] : refunds, path));
    if (request.method === "GET" && path.startsWith("/v1/refunds/")) {
      const refund = refunds.find(
        (row) => row.id === path.slice("/v1/refunds/".length),
      );
      if (!refund || state.hideRefunds)
        throw new Error("Unknown simulated refund");
      return ok(refund);
    }
    if (request.method === "GET" && path === "/v1/transfers")
      return ok(
        page(
          transfer &&
            transfer.transfer_group === url.searchParams.get("transfer_group")
            ? [transfer]
            : [],
          path,
        ),
      );
    if (
      request.method === "POST" &&
      path === "/v1/transfers/tr_durability/reversals"
    ) {
      state.reversalCreates++;
      const value = {
        id: `trr_durability_${state.reversalCreates}`,
        object: "transfer_reversal" as const,
        amount: Number(body.get("amount")),
        currency: "usd" as const,
        transfer: "tr_durability",
        created,
        metadata: metadata(body),
        balance_transaction: null,
      };
      if (
        !transfer ||
        value.amount !== state.expectedReversalAmount ||
        !value.metadata.finance_operation_id
      )
        throw new Error("Unexpected simulated reversal request");
      reversals.push(value);
      transfer.amount_reversed += value.amount;
      return state.loseReversalResponse ? lost() : ok(value);
    }
    if (
      request.method === "GET" &&
      path === "/v1/transfers/tr_durability/reversals"
    )
      return ok(page(state.hideReversals ? [] : reversals, path));
    if (request.method === "GET" && path === "/v1/events") {
      const events =
        url.searchParams.get("type") === "charge.captured"
          ? [
              {
                id: "evt_durability_capture",
                object: "event",
                type: "charge.captured",
                livemode: false,
                created,
                data: { object: charge() },
              },
            ]
          : refunds.map((refund) => ({
              id: `evt_${refund.id}`,
              object: "event",
              type: "refund.created",
              livemode: false,
              created,
              data: { object: refund },
            }));
      return ok(page(events, path));
    }
    transport.rejected.push(`${request.method} ${path}`);
    throw new Error(
      `Unexpected Stripe simulation request: ${request.method} ${path}`,
    );
  });
  return {
    ...transport,
    state,
    refunds,
    reversals,
    expireAuthorization() {
      if (intent.status !== "requires_capture" || state.captureCalls !== 0)
        throw new Error("Only an uncaptured authorization can expire");
      intent.status = "canceled";
      intent.amount_capturable = 0;
      return {
        status: intent.status,
        amount_capturable: intent.amount_capturable,
        amount_received: intent.amount_received,
      };
    },
    seedTransfer(orderId: string, sellerId: string) {
      transfer = {
        id: "tr_durability",
        object: "transfer",
        amount: 6_440,
        amount_reversed: 0,
        currency: "usd",
        livemode: false,
        destination: "acct_durabilityseller",
        source_transaction: "ch_durability",
        transfer_group: `group_${intent.id}`,
        metadata: { order_id: orderId, seller_id: sellerId },
        created,
        balance_transaction: null,
      };
    },
  };
}
