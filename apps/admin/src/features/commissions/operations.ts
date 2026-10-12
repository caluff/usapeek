import type Medusa from "@medusajs/js-sdk";
import type { HttpTypes, UpdateCommissionRateDTO } from "@mercurjs/types";
import {
  canEditCommission,
  parseCommissionPercentage,
  type CommissionState,
} from "./helpers";

type CommissionClient = Pick<Medusa["client"], "fetch">;

export async function readDefaultCommission(client: CommissionClient) {
  const result = await client.fetch<HttpTypes.AdminCommissionRateListResponse>(
    "/admin/commission-rates",
    { query: { is_default: true, limit: 2 }, cache: "no-store" },
  );
  if (result.count === 0 && result.commission_rates.length === 0) return null;
  if (result.count !== 1 || result.commission_rates.length !== 1)
    throw new Error("Expected one native global commission rate");
  const rate = result.commission_rates[0];
  if (!rate.is_default) throw new Error("Expected the native default rate");
  return rate;
}

export async function saveDefaultCommission(
  client: CommissionClient,
  formData: FormData,
): Promise<CommissionState> {
  const value = parseCommissionPercentage(formData.get("percentage"));
  const expectedValue = parseCommissionPercentage(
    formData.get("expected_value"),
  );
  if (
    value === null ||
    expectedValue === null ||
    formData.getAll("percentage").length !== 1 ||
    formData.getAll("expected_value").length !== 1 ||
    formData.getAll("rate_id").length !== 1
  )
    return {
      status: "error",
      message: "Ingresa un porcentaje válido entre 0 y 100.",
    };

  const rate = await readDefaultCommission(client);
  if (!rate || !canEditCommission(rate))
    return {
      status: "error",
      message:
        "No hay una tasa global porcentual activa disponible para editar. Actualiza el estado.",
    };
  if (rate.id !== formData.get("rate_id") || rate.value !== expectedValue)
    return {
      status: "error",
      message:
        "La tasa cambió desde que abriste esta página. Actualiza antes de guardar.",
    };

  // Only the scalar percentage belongs to this editor; never echo the entity.
  const body: Pick<UpdateCommissionRateDTO, "value"> = { value };
  await client.fetch<HttpTypes.AdminCommissionRateResponse>(
    `/admin/commission-rates/${encodeURIComponent(rate.id)}`,
    { method: "POST", body },
  );
  return {
    status: "success",
    message: "Comisión guardada.",
  };
}
