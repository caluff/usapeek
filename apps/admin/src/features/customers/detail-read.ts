import type { AdminCustomerPurchasesDetailResponse } from "@usapeek/api/customer-contracts";

export class CustomerDetailReadError extends Error {
  constructor(public status: number) {
    super(
      status === 401
        ? "Tu sesión venció. Vuelve a iniciar sesión."
        : status === 403
          ? "No tienes permisos para consultar este cliente."
          : status === 404
            ? "El cliente ya no está disponible."
            : "No se pudo cargar la ficha del cliente. Inténtalo de nuevo.",
    );
  }
  get isUnavailable() {
    return [401, 403, 404].includes(this.status);
  }
}

export async function readCustomerDetails(
  customerId: string,
  offset: number,
  signal: AbortSignal,
): Promise<AdminCustomerPurchasesDetailResponse> {
  const response = await fetch(
    `/dashboard/customers/${encodeURIComponent(customerId)}/data?offset=${offset}`,
    {
      cache: "no-store",
      signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
    },
  );
  if (!response.ok) throw new CustomerDetailReadError(response.status);
  return response.json();
}
