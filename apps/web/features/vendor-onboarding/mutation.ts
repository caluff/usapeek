import { FetchError } from "@medusajs/js-sdk"
import type { ApplicationResponse } from "@usapeek/vendor-onboarding-contracts"
import type { ApplicationActionResult } from "./types"

export async function performApplicationMutation<Context>(dependencies: {
  authenticate: () => Promise<Context>
  mutate: (context: Context) => Promise<ApplicationResponse>
  reload: (context: Context) => Promise<ApplicationResponse>
}): Promise<ApplicationActionResult> {
  // Authentication must happen even for a replay, and redirects must escape the catch.
  const context = await dependencies.authenticate()
  try {
    const response = await dependencies.mutate(context)
    return {
      status: "success",
      message:
        response.application?.status === "submitted"
          ? "Solicitud enviada para revisión."
          : "Borrador guardado.",
      response,
    }
  } catch (error) {
    if (error instanceof FetchError && error.status === 409) {
      let response: ApplicationResponse | undefined
      try {
        response = await dependencies.reload(context)
      } catch {
        /* Local values remain available for recovery. */
      }
      return {
        status: "conflict",
        message:
          "La solicitud cambió o tiene un conflicto. Conservamos tus datos en este formulario. Revisa la versión guardada antes de continuar.",
        response,
      }
    }
    const status = error instanceof FetchError ? error.status : undefined
    return {
      status: "error",
      retryable: !status || status >= 500,
      message:
        status === 403
          ? "No se pudo enviar la solicitud. Verifica tu correo y revisa si tu cuenta sigue habilitada."
          : status === 401
            ? "Tu sesión venció. Inicia sesión nuevamente para continuar."
            : status === 400
              ? "Revisa los datos de la solicitud; el servicio no pudo validarlos."
              : status === 429
                ? "Demasiados intentos. Espera unos minutos antes de volver a intentarlo."
                : "No pudimos confirmar el guardado. Puedes reintentar la misma operación sin duplicar tu solicitud.",
    }
  }
}
