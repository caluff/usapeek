import { DEFAULT_TABLE_PAGE_SIZE } from "@usapeek/ui/pagination-utils";
import { listInput } from "../workspace/presentation";

export const CATALOG_STATUS_LABELS = {
  proposed: "Propuesto",
  draft: "Borrador",
  published: "Publicado",
  rejected: "Rechazado",
};

export function catalogListInput(params: {
  q?: string | string[];
  page?: string | string[];
  status?: string | string[];
}) {
  return {
    ...listInput(params, DEFAULT_TABLE_PAGE_SIZE),
    status:
      typeof params.status === "string" &&
      Object.hasOwn(CATALOG_STATUS_LABELS, params.status)
        ? (params.status as keyof typeof CATALOG_STATUS_LABELS)
        : ("all" as const),
  };
}

export function catalogListHref(
  input: ReturnType<typeof catalogListInput>,
  page = 1,
) {
  const params = new URLSearchParams({
    status: input.status,
    page: String(page),
  });
  if (input.q) params.set("q", input.q);
  return `/seller/catalog?${params}`;
}
