import type Medusa from "@medusajs/js-sdk";
import { createCatalogCategory } from "@/features/vendor-applications/category-proposal";
import {
  parseCategoryInput,
  type CategoryState,
  type parseCategoryFilters,
} from "./helpers";

type CategoryResource = Pick<
  Medusa["admin"]["productCategory"],
  "list" | "create"
>;

export function listCategories(
  resource: Pick<CategoryResource, "list">,
  filters: ReturnType<typeof parseCategoryFilters>,
) {
  return resource.list({
    q: filters.q || undefined,
    limit: filters.limit,
    offset: filters.offset,
    order: "-created_at",
    fields: "id,name,is_active,is_internal",
  });
}

export async function createCategory(
  resource: CategoryResource,
  formData: FormData,
): Promise<CategoryState> {
  const input = parseCategoryInput(formData);
  if (!input)
    return {
      status: "error",
      message: "Escribe un nombre válido de hasta 120 caracteres.",
    };
  const result = await createCatalogCategory(resource, input);
  return result.created
    ? { status: "success", message: "Categoría creada." }
    : {
        status: "error",
        message: "Ya existe una categoría con ese nombre. Búscala en la lista.",
      };
}
