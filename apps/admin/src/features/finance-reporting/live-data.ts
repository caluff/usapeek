import type { AdminFinanceReportingResponse } from "@usapeek/api/finance-contracts";

export type FinanceReportState = {
  data?: AdminFinanceReportingResponse;
  error?: string;
  isDenied?: boolean;
};

export class FinanceReportReadError extends Error {
  constructor(public status: number) {
    super(
      status === 401
        ? "Tu sesión venció. Vuelve a entrar al portal."
        : status === 403
          ? "No tienes permisos para consultar el informe financiero."
          : "No se pudo actualizar el informe. Se volverá a intentar automáticamente.",
    );
  }
  get isDenied() {
    return this.status === 401 || this.status === 403;
  }
}

export function reportReadFailure(
  previous: FinanceReportState,
  error: unknown,
): FinanceReportState {
  const isDenied =
    previous.isDenied ||
    (error instanceof FinanceReportReadError && error.isDenied);
  return {
    data: isDenied ? undefined : previous.data,
    isDenied,
    error:
      error instanceof FinanceReportReadError
        ? error.message
        : "No se pudo actualizar el informe. Se volverá a intentar automáticamente.",
  };
}

export async function readLiveReport(
  url: string,
  signal: AbortSignal,
): Promise<AdminFinanceReportingResponse> {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
  });
  if (!response.ok) throw new FinanceReportReadError(response.status);
  return response.json();
}
