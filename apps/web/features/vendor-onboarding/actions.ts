"use server"

import type {
  ApplicationResponse,
  ReadNotificationsBody,
  ReadNotificationsResponse,
  SaveApplicationBody,
  SubmitApplicationBody,
  VerificationResponse,
} from "@usapeek/vendor-onboarding-contracts"
import { FetchError } from "@medusajs/js-sdk"
import { revalidatePath } from "next/cache"
import { clearVerificationSecrets, getVerificationCode } from "@/lib/auth-sdk"
import { requireApplicant } from "./data"
import { performApplicationMutation } from "./mutation"
import { APPLICATION_PATH } from "./presentation"
import type { ApplicationActionResult, Feedback } from "./types"
import { STEPS, validMutation } from "./validation"

async function mutateApplication(
  body: SaveApplicationBody | SubmitApplicationBody,
  submit: boolean,
): Promise<ApplicationActionResult> {
  if (
    !body ||
    !validMutation(body) ||
    (submit
      ? !("accepted_terms" in body && body.accepted_terms === true)
      : !("current_step" in body && STEPS.includes(body.current_step)))
  ) {
    await requireApplicant()
    return {
      status: "error",
      message: "La operación no es válida. Recarga la solicitud.",
    }
  }
  const result = await performApplicationMutation({
    authenticate: requireApplicant,
    mutate: ({ sdk }) =>
      sdk.client.fetch<ApplicationResponse>(
        `/store/vendor-application${submit ? "/submit" : ""}`,
        { method: "POST", body, cache: "no-store" },
      ),
    reload: ({ sdk }) =>
      sdk.client.fetch<ApplicationResponse>("/store/vendor-application", {
        cache: "no-store",
      }),
  })
  // The wizard consumes the saved response. Re-render shared navigation only
  // when creating a draft or submitting, not after every intermediate step.
  if (result.status === "success" && (submit || body.expected_version === 0)) {
    revalidatePath("/account", "layout")
    revalidatePath("/")
  }
  return result
}

export async function saveApplicationAction(body: SaveApplicationBody) {
  return mutateApplication(body, false)
}
export async function submitApplicationAction(body: SubmitApplicationBody) {
  return mutateApplication(body, true)
}

export async function requestApplicationVerificationAction(): Promise<
  Feedback & { testCode?: VerificationResponse["test_code"] }
> {
  const { sdk } = await requireApplicant()
  try {
    const result = await sdk.client.fetch<VerificationResponse>(
      "/store/vendor-application/verification",
      { method: "POST", body: {}, cache: "no-store" },
    )
    return {
      status: "success",
      message: result.test_code
        ? "Código de prueba generado y completado. Confírmalo para continuar."
        : "Se solicitó un código de verificación. Revisa tu correo; la solicitud no confirma la entrega.",
      retryAfterSeconds: result.retry_after_seconds,
      testCode: result.test_code,
    }
  } catch (error) {
    const status = error instanceof FetchError ? error.status : undefined
    return {
      status: "error",
      message:
        status === 503
          ? "El envío de correos aún no está configurado. Tu borrador está disponible, pero no podrás enviarlo hasta que usapeek habilite la verificación."
          : status === 429
            ? "Espera antes de solicitar otro código. El servicio limita los reenvíos."
            : "No pudimos solicitar el código. Inténtalo de nuevo más tarde.",
      retryAfterSeconds: status === 429 ? 60 : undefined,
    }
  }
}

export async function confirmApplicationVerificationAction(
  codeInput: string,
): Promise<Feedback> {
  const { sdk } = await requireApplicant()
  const code =
    (typeof codeInput === "string" ? codeInput.trim() : "") ||
    (await getVerificationCode()) ||
    ""
  if (!code || code.length > 512)
    return { status: "error", message: "Ingresa el código de verificación." }
  try {
    await sdk.auth.verification.confirm({ code })
    await clearVerificationSecrets()
    const response = await sdk.client.fetch<ApplicationResponse>(
      "/store/vendor-application",
      { cache: "no-store" },
    )
    if (!response.applicant.email_verified)
      return {
        status: "error",
        message:
          "El código no verificó el correo de esta cuenta. Solicita un código para tu solicitud.",
      }
    revalidatePath(APPLICATION_PATH)
    return {
      status: "success",
      message: "Correo verificado. Ya puedes continuar con tu solicitud.",
    }
  } catch {
    return {
      status: "error",
      message: "El código no es válido o ya venció. Solicita uno nuevo.",
    }
  }
}

export async function readApplicationNotificationsAction(
  body: ReadNotificationsBody,
): Promise<Feedback> {
  const { sdk } = await requireApplicant()
  if (
    !Array.isArray(body?.notification_ids) ||
    !body.notification_ids.length ||
    body.notification_ids.length > 50
  )
    return {
      status: "error",
      message: "Selecciona las notificaciones que quieres marcar como leídas.",
    }
  try {
    await sdk.client.fetch<ReadNotificationsResponse>(
      "/store/vendor-application/notifications/read",
      { method: "POST", body, cache: "no-store" },
    )
    revalidatePath("/account", "layout")
    revalidatePath("/")
    return {
      status: "success",
      message: "Notificaciones marcadas como leídas.",
    }
  } catch {
    return {
      status: "error",
      message: "No pudimos actualizar las notificaciones. Inténtalo de nuevo.",
    }
  }
}
