import type {
  ApplicationStatus,
  ReviewApplicationBody,
} from "@usapeek/vendor-onboarding-contracts";
import { intlFormat } from "date-fns/intlFormat";
import { isValid } from "date-fns/isValid";
import { parseISO } from "date-fns/parseISO";
import { DEFAULT_TABLE_PAGE_SIZE, parseTableOffset } from "@/lib/pagination";

export const APPLICATION_STATUS_LABELS = {
  draft: "Borrador",
  submitted: "En revisión",
  changes_requested: "Necesita cambios",
  approved: "Aprobada",
  rejected: "Rechazada",
} satisfies Record<ApplicationStatus, string>;

export const APPLICATION_PAGE_SIZE = DEFAULT_TABLE_PAGE_SIZE;

export function parseApplicationFilters(
  params: Record<string, string | string[] | undefined>,
) {
  const status =
    typeof params.status === "string" &&
    Object.hasOwn(APPLICATION_STATUS_LABELS, params.status)
      ? (params.status as ApplicationStatus)
      : "submitted";
  return {
    status,
    q: typeof params.q === "string" ? params.q.trim().slice(0, 100) : "",
    offset: parseTableOffset(params.offset),
    limit: APPLICATION_PAGE_SIZE,
  };
}

export function applicationListHref(
  filters: ReturnType<typeof parseApplicationFilters>,
  offset = filters.offset,
) {
  const query = new URLSearchParams({
    status: filters.status,
    offset: String(Math.max(0, offset)),
  });
  if (filters.q) query.set("q", filters.q);
  return `/dashboard/vendor-applications?${query}`;
}

export function isApplicationId(value: string) {
  return /^[a-zA-Z0-9_-]{1,100}$/.test(value);
}

export type ReviewActionState = {
  status: "idle" | "error" | "success" | "processing";
  message?: string;
  fieldErrors?: { reason?: string; decision?: string };
};

export function parseReviewInput(
  formData: FormData,
): { body: ReviewApplicationBody } | { error: ReviewActionState } {
  const decision = formData.get("decision");
  const reasonValue = formData.get("reason");
  const reason = typeof reasonValue === "string" ? reasonValue.trim() : "";
  const rawVersion = formData.get("expected_version");
  const version =
    typeof rawVersion === "string" && /^\d+$/.test(rawVersion)
      ? Number(rawVersion)
      : NaN;
  const mutationId = formData.get("mutation_id");
  if (
    !Number.isSafeInteger(version) ||
    version < 1 ||
    typeof mutationId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      mutationId,
    )
  ) {
    return {
      error: {
        status: "error",
        message:
          "La solicitud cambió o el formulario no es válido. Recarga antes de continuar.",
      },
    };
  }
  if (
    decision !== "approve" &&
    decision !== "request_changes" &&
    decision !== "reject"
  ) {
    return {
      error: {
        status: "error",
        fieldErrors: { decision: "Selecciona una decisión." },
      },
    };
  }
  if (decision !== "approve" && (reason.length < 10 || reason.length > 2000)) {
    return {
      error: {
        status: "error",
        fieldErrors: {
          reason: "Explica el motivo en entre 10 y 2000 caracteres.",
        },
      },
    };
  }
  const mutation = { mutation_id: mutationId, expected_version: version };
  return {
    body:
      decision === "approve"
        ? { ...mutation, decision }
        : { ...mutation, decision, reason },
  };
}

export function applicationDate(value: string | null) {
  if (!value) return "—";
  const date = parseISO(value);
  if (!isValid(date)) return "—";
  return intlFormat(
    date,
    { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" },
    { locale: "es" },
  );
}
