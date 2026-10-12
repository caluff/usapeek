import type {
  ApplicationResponse,
  ApplicationStatus,
} from "@usapeek/vendor-onboarding-contracts"
import { intlFormat } from "date-fns/intlFormat"
import { isValid } from "date-fns/isValid"
import { parseISO } from "date-fns/parseISO"

export function formatApplicationEventDate(value: string) {
  const date = parseISO(value)
  if (!isValid(date)) return "Fecha no disponible"
  return `${intlFormat(
    date,
    { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" },
    { locale: "es-US" },
  )} UTC`
}

export const APPLICATION_PATH = "/account/sell"
export const APPLICATION_LOGIN_PATH = "/login?next=%2Faccount%2Fsell"

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  draft: "Borrador",
  submitted: "En revisión",
  changes_requested: "Necesita correcciones",
  approved: "Solicitud aprobada",
  rejected: "Solicitud rechazada",
}

export type ApplicationNavigation = {
  label: string
  unreadCount: number
}

export function applicationNavigation(
  response: ApplicationResponse | null,
): ApplicationNavigation {
  const application = response?.application
  return {
    label:
      response?.applicant.existing_vendor_access ||
      application?.status === "approved"
        ? "Mi tienda"
        : application?.status === "draft"
          ? "Continuar solicitud"
          : application?.status === "changes_requested"
            ? "Corregir solicitud"
            : application
              ? "Ver solicitud"
              : "Vender en usapeek",
    unreadCount: response?.unread_count ?? 0,
  }
}

export function vendorPanelUrl(origin: string | undefined): string | null {
  if (!origin) return null
  try {
    const url = new URL(origin)
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    if (
      (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      return null
    return "/auth/vendor"
  } catch {
    return null
  }
}
