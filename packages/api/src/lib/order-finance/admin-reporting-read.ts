import type { MedusaContainer } from "@medusajs/framework/types";
import type {
  FinanceReportingQuery,
  AdminFinanceReportingResponse,
} from "./contracts";
import { readAdminReportingProjection } from "./admin-reporting-projection";
import { requireFinanceOperator } from "./settlement-authorization";

type ReportInput = { actor_id: string; query: FinanceReportingQuery };
type Flight = {
  controller: AbortController;
  promise: Promise<AdminFinanceReportingResponse>;
  readers: number;
  settled: boolean;
};

const flights = new Map<string, Flight>();

function joinFlight(flight: Flight, signal?: AbortSignal, participate = true) {
  if (participate) flight.readers++;
  return new Promise<AdminFinanceReportingResponse>((resolve, reject) => {
    let finished = false;
    const finish = (failed: boolean, value: unknown) => {
      if (finished) return;
      finished = true;
      signal?.removeEventListener("abort", aborted);
      if (participate && --flight.readers === 0 && !flight.settled)
        flight.controller.abort();
      if (failed) reject(value);
      else resolve(value as AdminFinanceReportingResponse);
    };
    const aborted = () => finish(true, signal?.reason);
    signal?.addEventListener("abort", aborted, { once: true });
    flight.promise.then(
      (value) => finish(false, value),
      (error) => finish(true, error),
    );
    if (signal?.aborted) aborted();
  });
}

export async function readAdminFinanceReporting(
  container: MedusaContainer,
  input: ReportInput,
  signal?: AbortSignal,
): Promise<AdminFinanceReportingResponse> {
  signal?.throwIfAborted();
  // Every HTTP reader proves current authority before sharing any result.
  await requireFinanceOperator(container, input.actor_id);
  signal?.throwIfAborted();
  const key = JSON.stringify([
    input.actor_id,
    input.query.period,
    input.query.mode,
    input.query.currency_code,
    input.query.data_kind,
  ]);
  while (true) {
    let flight = flights.get(key);
    if (flight?.controller.signal.aborted) {
      // A canceled flight retains its slot while native queries drain. A new
      // reader waits for that drain instead of stacking more abandoned reads.
      try {
        await joinFlight(flight, signal, false);
      } catch {
        signal?.throwIfAborted();
      }
      continue;
    }
    if (!flight) {
      const controller = new AbortController();
      const created: Flight = {
        controller,
        readers: 0,
        settled: false,
        promise: Promise.resolve()
          .then(() =>
            readAdminReportingProjection(container, {
              ...input,
              signal: controller.signal,
            }),
          )
          .finally(() => {
            created.settled = true;
            if (flights.get(key) === created) flights.delete(key);
          }),
      };
      flights.set(key, created);
      flight = created;
    }
    return joinFlight(flight, signal);
  }
}
