import { DEFAULT_TABLE_PAGE_SIZE, parseTableOffset } from "@/lib/pagination";

export type CategoryState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export function parseCategoryInput(formData: FormData) {
  const rawName = formData.get("name");
  if (typeof rawName !== "string" || formData.getAll("name").length !== 1)
    return null;
  const name = rawName.trim();
  const handle = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (!name || name.length > 120 || /[\r\n]/.test(name) || !handle) return null;
  return { name, handle };
}

export function parseCategoryFilters(
  params: Record<string, string | string[] | undefined>,
) {
  return {
    q: typeof params.q === "string" ? params.q.trim().slice(0, 100) : "",
    offset: parseTableOffset(params.offset),
    limit: DEFAULT_TABLE_PAGE_SIZE,
  };
}

export function categoryListHref(
  filters: ReturnType<typeof parseCategoryFilters>,
  offset: number,
) {
  const query = new URLSearchParams({ offset: String(Math.max(0, offset)) });
  if (filters.q) query.set("q", filters.q);
  return `/dashboard/categories?${query}`;
}

export function categoryErrorMessage(status?: number) {
  if (status === 401) return "Tu sesión venció. Vuelve a iniciar sesión.";
  if (status === 403)
    return "Tu cuenta no tiene permisos para gestionar categorías.";
  if (status === 400)
    return "Revisa el nombre de la categoría e inténtalo de nuevo.";
  return "No se pudo completar la operación. Revisa la lista antes de reintentar.";
}
