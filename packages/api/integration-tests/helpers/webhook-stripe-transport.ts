import https from "node:https";
import type { RequestOptions } from "node:https";
import type { ClientRequest, OutgoingHttpHeaders } from "node:http";
import { Readable, Writable } from "node:stream";
import type Stripe from "stripe";

/**
 * Only Stripe's network boundary is simulated. Both its native ESM provider and
 * the application SDK still parse the response and verify real local HMACs.
 * Nothing can fall through to HTTPS, including unexpected money mutations.
 */
export type StripeTransportRequest = {
  method: string;
  path: string;
  headers: OutgoingHttpHeaders | readonly string[];
  body: string;
};

export type StripeTransportResponse = { statusCode: number; body: unknown };

export function installStripeTransport(
  responder: (
    request: StripeTransportRequest,
  ) => StripeTransportResponse | Promise<StripeTransportResponse>,
) {
  const requests: StripeTransportRequest[] = [];
  const rejected: string[] = [];
  const request = jest
    .spyOn(https, "request")
    .mockImplementation((options: string | URL | RequestOptions) => {
      if (
        typeof options !== "object" ||
        options instanceof URL ||
        options.host !== "api.stripe.com" ||
        (options.port !== undefined && String(options.port) !== "443") ||
        typeof options.method !== "string" ||
        typeof options.path !== "string"
      ) {
        rejected.push("Unexpected HTTPS destination or method");
        throw new Error("Webhook integration blocks all unconfigured HTTPS IO");
      }
      const captured = {
        method: options.method,
        path: options.path,
        headers: options.headers ?? {},
      };
      const chunks: Buffer[] = [];
      const outgoing = Object.assign(
        new Writable({
          write(chunk: Buffer, _encoding, callback) {
            chunks.push(chunk);
            callback();
          },
          final(callback) {
            callback();
            const input = {
              ...captured,
              body: Buffer.concat(chunks).toString("utf8"),
            };
            requests.push(input);
            const requestId = `req_simulated_${requests.length}`;
            void Promise.resolve()
              .then(() => responder(input))
              .then(
                (result) => {
                  const response = Object.assign(
                    Readable.from([JSON.stringify(result.body)]),
                    {
                      statusCode: result.statusCode,
                      headers: {
                        "content-type": "application/json",
                        "request-id": requestId,
                      },
                    },
                  );
                  outgoing.emit("response", response);
                },
                (error: unknown) => {
                  // Preserve real SDK retry behavior; no request ever reaches the wire.
                  rejected.push(`${input.method} ${input.path}`);
                  outgoing.emit(
                    "error",
                    error instanceof Error ? error : new Error(String(error)),
                  );
                },
              );
          },
        }),
        { setTimeout: () => outgoing },
      );
      queueMicrotask(() => outgoing.emit("socket", { connecting: false }));
      // Stripe's NodeHttpClient only uses these Writable and timeout methods.
      return outgoing as unknown as ClientRequest;
    });
  return { requests, rejected, restore: () => request.mockRestore() };
}

export function installWebhookStripeTransport() {
  const accounts = new Map<string, Stripe.Account>();
  const reads: string[] = [];
  const transport = installStripeTransport((request) => {
    const match = /^\/v1\/accounts\/(acct_[A-Za-z0-9]+)$/.exec(request.path);
    const account = request.method === "GET" && match && accounts.get(match[1]);
    if (!account) {
      throw new Error("Webhook integration has no simulated account response");
    }
    reads.push(account.id);
    return { statusCode: 200, body: structuredClone(account) };
  });
  return { ...transport, accounts, reads };
}
