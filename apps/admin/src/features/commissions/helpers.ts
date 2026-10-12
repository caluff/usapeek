import type { CommissionRateDTO } from "@mercurjs/types";

export type CommissionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export function parseCommissionPercentage(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value.trim()))
    return null;
  const percentage = Number(value.trim());
  return Number.isFinite(percentage) && percentage >= 0 && percentage <= 100
    ? percentage
    : null;
}

export function canEditCommission(rate: CommissionRateDTO): boolean {
  return (
    rate.is_default === true &&
    rate.is_enabled === true &&
    rate.type === "percentage" &&
    rate.currency_code === null &&
    Array.isArray(rate.rules) &&
    rate.rules.length === 0 &&
    typeof rate.include_tax === "boolean" &&
    typeof rate.include_shipping === "boolean" &&
    Number.isFinite(rate.value) &&
    rate.value >= 0 &&
    rate.value <= 100
  );
}

export function commissionBaseDescription(
  rate: Pick<CommissionRateDTO, "include_tax" | "include_shipping">,
): string {
  return `Subtotal de los productos antes de descuentos, ${rate.include_tax ? "con impuestos" : "sin impuestos"}. ${rate.include_shipping ? "El envío también genera comisión con esta tasa global, sobre su subtotal antes de descuentos" : "El envío no genera comisión"}.`;
}

export function commissionErrorMessage(status?: number): string {
  if (status === 401) return "Tu sesión venció. Vuelve a iniciar sesión.";
  if (status === 403)
    return "Tu cuenta no tiene permisos para gestionar comisiones.";
  if (status === 404)
    return "La comisión ya no está disponible. Actualiza el estado.";
  return "No se pudo completar la operación. Actualiza y comprueba la tasa vigente antes de reintentar.";
}
