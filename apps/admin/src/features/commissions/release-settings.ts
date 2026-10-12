import type Medusa from "@medusajs/js-sdk";
import type {
  PaymentReleaseSettingsResponse,
  UpdatePaymentReleaseSettings,
} from "@usapeek/api/finance-contracts";
import type { CommissionState } from "./helpers";

type Client = Pick<Medusa["client"], "fetch">;

export function parseReleaseDelayDays(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const days = Number(value);
  return Number.isInteger(days) && days >= 0 && days <= 365 ? days : null;
}

export function releaseDelayLabel(days: number): string {
  if (days === 0) return "Inmediato";
  if (days === 7) return "Una semana";
  return `${days} ${days === 1 ? "día" : "días"}`;
}

function isReleaseSettingsResponse(
  response: unknown,
): response is PaymentReleaseSettingsResponse {
  if (
    typeof response !== "object" ||
    response === null ||
    !("settings" in response) ||
    !("automatic_available" in response) ||
    typeof response.automatic_available !== "boolean"
  )
    return false;
  const settings = response.settings;
  return (
    typeof settings === "object" &&
    settings !== null &&
    "mode" in settings &&
    (settings.mode === "manual" || settings.mode === "automatic") &&
    "delay_days" in settings &&
    typeof settings.delay_days === "number" &&
    Number.isInteger(settings.delay_days) &&
    settings.delay_days >= 0 &&
    settings.delay_days <= 365 &&
    "revision" in settings &&
    typeof settings.revision === "string" &&
    settings.revision.length > 0 &&
    settings.revision.length <= 64
  );
}

export async function readReleaseSettings(
  client: Client,
): Promise<PaymentReleaseSettingsResponse> {
  const response = await client.fetch<unknown>(
    "/admin/payment-release-settings",
    { cache: "no-store" },
  );
  if (!isReleaseSettingsResponse(response))
    throw new Error("Invalid payment release settings response");
  return response;
}

export async function saveReleaseSettings(
  client: Client,
  formData: FormData,
): Promise<CommissionState> {
  const mode = formData.get("mode");
  const revision = formData.get("expected_revision");
  const delayDays = parseReleaseDelayDays(formData.get("delay_days"));
  if (
    (mode !== "manual" && mode !== "automatic") ||
    typeof revision !== "string" ||
    !revision ||
    revision.length > 64 ||
    formData.getAll("mode").length !== 1 ||
    formData.getAll("expected_revision").length !== 1
  ) {
    return {
      status: "error",
      message: "Selecciona un modo de liberación válido.",
    };
  }
  if (delayDays === null || formData.getAll("delay_days").length !== 1)
    return {
      status: "error",
      message:
        "El tiempo de espera debe ser un número entero entre 0 y 365 días.",
    };
  const body: UpdatePaymentReleaseSettings = {
    mode,
    delay_days: delayDays,
    expected_revision: revision,
  };
  const response = await client.fetch<unknown>(
    "/admin/payment-release-settings",
    { method: "POST", body },
  );
  if (
    !isReleaseSettingsResponse(response) ||
    response.settings.mode !== mode ||
    response.settings.delay_days !== delayDays ||
    (mode === "automatic" && !response.automatic_available)
  )
    return {
      status: "error",
      message:
        "No se pudo confirmar la configuración guardada. Actualiza la página y comprueba el modo y el tiempo de espera.",
    };
  return {
    status: "success",
    message: "Configuración de liberación guardada.",
  };
}

export function releaseSettingsErrorMessage(status?: number) {
  if (status === 401) return "Tu sesión venció. Vuelve a iniciar sesión.";
  if (status === 403)
    return "Tu cuenta no tiene permisos para cambiar la configuración de liberación.";
  if (status === 409)
    return "La configuración de liberación cambió o hay una operación de pagos en curso o pendiente de revisión. Actualiza la página antes de guardar. Si la operación está en curso, espera a que termine; si el bloqueo persiste, requiere revisión.";
  if (status === 400)
    return "No se pudo guardar la configuración de liberación. Comprueba el tiempo de espera y la configuración de Stripe antes de reintentar.";
  return "No se pudo guardar la configuración de liberación. Actualiza la página y comprueba la configuración.";
}
