import type { AdminCatalogProductManageInput } from "@usapeek/api/catalog-management-contracts";
import { isValid } from "date-fns/isValid";
import { parseISO } from "date-fns/parseISO";

export type ProductContentInput = Extract<
  AdminCatalogProductManageInput,
  { action: "update-content" }
>["content"];
export type ProductVisibilityAction = Exclude<
  AdminCatalogProductManageInput["action"],
  "update-content"
>;

export function productUpdatedAt(value: string | Date | null | undefined) {
  const date = typeof value === "string" ? parseISO(value) : value;
  return date && isValid(date) ? date.toISOString() : "";
}

export function parseProductContent(
  formData: FormData,
): ProductContentInput | null {
  const title = formData.get("title");
  const subtitle = formData.get("subtitle");
  const description = formData.get("description");
  if (
    typeof title !== "string" ||
    typeof subtitle !== "string" ||
    typeof description !== "string" ||
    !title.trim() ||
    title.trim().length > 200 ||
    subtitle.trim().length > 200 ||
    description.trim().length > 20_000
  )
    return null;
  return {
    title: title.trim(),
    subtitle: subtitle.trim() || null,
    description: description.trim() || null,
  };
}

export function parseProductVisibilityAction(
  value: unknown,
): ProductVisibilityAction | null {
  return value === "withdraw" || value === "publish" ? value : null;
}
