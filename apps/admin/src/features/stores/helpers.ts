import type {
  CatalogPermissionDTO,
  CatalogPermissionMode,
} from "@usapeek/api/catalog-permission-contracts";
import { DEFAULT_TABLE_PAGE_SIZE, parseTableOffset } from "@/lib/pagination";

export const CATALOG_PERMISSION_LABELS = {
  supervised: "Supervisado",
  authorized: "Autorizado",
} satisfies Record<CatalogPermissionMode, string>;

export type CatalogPermissionState =
  | { status: "idle"; message?: undefined }
  | { status: "error"; message: string }
  | { status: "success"; message: string; mode: CatalogPermissionMode };

export function parseCatalogReviewMode(
  value: unknown,
): CatalogPermissionMode | null {
  return value === "supervised" || value === "authorized" ? value : null;
}

export function catalogReviewMode(
  permission: CatalogPermissionDTO | undefined,
): CatalogPermissionMode | null {
  return permission ? parseCatalogReviewMode(permission.mode) : "supervised";
}

export const STORE_STATUS_LABELS = {
  open: "Activa",
  pending_approval: "Pendiente de aprobación",
  suspended: "Suspendida",
  terminated: "Cerrada",
};

export function parseStoreFilters(
  params: Record<string, string | string[] | undefined>,
) {
  return {
    q: typeof params.q === "string" ? params.q.trim().slice(0, 100) : "",
    status:
      typeof params.status === "string" &&
      Object.hasOwn(STORE_STATUS_LABELS, params.status)
        ? (params.status as keyof typeof STORE_STATUS_LABELS)
        : ("all" as const),
    offset: parseTableOffset(params.offset),
    limit: DEFAULT_TABLE_PAGE_SIZE,
  };
}

export function storeListHref(
  filters: ReturnType<typeof parseStoreFilters>,
  offset: number,
) {
  const query = new URLSearchParams({
    status: filters.status,
    offset: String(Math.max(0, offset)),
  });
  if (filters.q) query.set("q", filters.q);
  return `/dashboard/stores?${query}`;
}

export function storeStatusLabel(status: string) {
  return (
    STORE_STATUS_LABELS[status as keyof typeof STORE_STATUS_LABELS] ?? status
  );
}

export function isStoreId(id: string) {
  return /^[a-zA-Z0-9_-]{1,100}$/.test(id);
}
