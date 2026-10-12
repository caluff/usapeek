import type Medusa from "@medusajs/js-sdk";
import type {
  PaymentCaptureSettingsResponse,
  UpdatePaymentCaptureSettings,
} from "@usapeek/api/finance-contracts";
import type { CommissionState } from "./helpers";

type Client = Pick<Medusa["client"], "fetch">;

export async function readCaptureSettings(client: Client) {
  return client.fetch<PaymentCaptureSettingsResponse>(
    "/admin/payment-capture-settings",
    {
      cache: "no-store",
    },
  );
}

export async function saveCaptureSettings(
  client: Client,
  formData: FormData,
): Promise<CommissionState> {
  const mode = formData.get("mode");
  const revision = formData.get("expected_revision");
  if (
    (mode !== "manual" && mode !== "automatic") ||
    typeof revision !== "string" ||
    !revision ||
    revision.length > 64 ||
    formData.getAll("mode").length !== 1 ||
    formData.getAll("expected_revision").length !== 1
  ) {
    return { status: "error", message: "Selecciona un modo de cobro válido." };
  }
  const body: UpdatePaymentCaptureSettings = {
    mode,
    expected_revision: revision,
  };
  await client.fetch<PaymentCaptureSettingsResponse>(
    "/admin/payment-capture-settings",
    { method: "POST", body },
  );
  return { status: "success", message: "Modo de cobro guardado." };
}

export function captureSettingsErrorMessage(status?: number) {
  if (status === 401) return "Tu sesión venció. Vuelve a iniciar sesión.";
  if (status === 403)
    return "Tu cuenta no tiene permisos para cambiar el modo de cobro.";
  if (status === 409)
    return "El modo de cobro cambió o hay una operación de pagos en curso o pendiente de revisión. Actualiza la página antes de guardar. Si la operación está en curso, espera a que termine; si el bloqueo persiste, requiere revisión.";
  return "No se pudo guardar el modo de cobro. Actualiza la página y comprueba la configuración.";
}
