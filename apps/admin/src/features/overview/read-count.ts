import type { OverviewMetricDefinition } from "./metrics";

export class OverviewCountReadError extends Error {
  constructor(public isDenied: boolean) {
    super(isDenied ? "No tienes acceso a este indicador." : "No se pudo actualizar el indicador.");
  }
}

export async function readLiveOverviewCount(
  id: OverviewMetricDefinition["id"],
  signal: AbortSignal,
) {
  const response = await fetch(`/dashboard/overview/data?metric=${id}`, {
    signal,
    cache: "no-store",
  });
  if (!response.ok) {
    return {
      count: null,
      isDenied: response.status === 401 || response.status === 403,
    };
  }
  const result: unknown = await response.json();
  if (
    !result ||
    typeof result !== "object" ||
    !("count" in result) ||
    typeof result.count !== "number" ||
    !Number.isSafeInteger(result.count) ||
    result.count < 0
  ) {
    return { count: null, isDenied: false };
  }
  return { count: result.count, isDenied: false };
}
