import { FetchError, type default as Medusa } from "@medusajs/js-sdk";
import type { AdminApplicationView } from "@usapeek/vendor-onboarding-contracts";

export type CategoryProposalState = {
  status: "idle" | "error" | "success";
  message?: string;
};

export function parseCategoryProposalInput(formData: FormData) {
  const rawName = formData.get("name");
  const name = typeof rawName === "string" ? rawName.trim() : "";
  const rawVersion = formData.get("expected_version");
  const version =
    typeof rawVersion === "string" && /^\d+$/.test(rawVersion)
      ? Number(rawVersion)
      : NaN;
  const handle = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (
    !name ||
    name.length > 120 ||
    /[\r\n]/.test(name) ||
    !handle ||
    !Number.isSafeInteger(version) ||
    version < 1
  )
    return null;
  return { name, handle, version };
}

export function canCreateProposedCategory(
  application: Pick<AdminApplicationView, "version" | "submitted_data">,
  expectedVersion: number,
) {
  return (
    application.version === expectedVersion &&
    Boolean(application.submitted_data?.activity.category_suggestion?.trim())
  );
}

// A stable native handle makes retries safe even if the create response was lost.
export async function createCatalogCategory(
  resource: Pick<Medusa["admin"]["productCategory"], "list" | "create">,
  input: { name: string; handle: string },
) {
  const { product_categories } = await resource.list({
    handle: input.handle,
    limit: 1,
  });
  if (product_categories.length) return { created: false };
  try {
    await resource.create({ ...input, is_active: true, is_internal: false });
    return { created: true };
  } catch (error) {
    // The native unique handle also protects concurrent operator submissions.
    if (error instanceof FetchError && error.status === 409)
      return { created: false };
    throw error;
  }
}
