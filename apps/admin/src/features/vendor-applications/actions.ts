"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import {
  applicationServiceError,
  createProposedCategory,
  reviewVendorApplication,
} from "./data";
import {
  parseCategoryProposalInput,
  type CategoryProposalState,
} from "./category-proposal";
import {
  isApplicationId,
  parseReviewInput,
  type ReviewActionState,
} from "./helpers";

export async function reviewApplicationAction(
  id: string,
  _previous: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  if (!isApplicationId(id))
    return { status: "error", message: "La solicitud no es válida." };
  const parsed = parseReviewInput(formData);
  if ("error" in parsed) return parsed.error;
  try {
    const { application } = await reviewVendorApplication(id, parsed.body);
    revalidatePath("/dashboard/vendor-applications");
    revalidatePath(`/dashboard/vendor-applications/${id}`);
    if (application.approval_state === "processing") {
      return {
        status: "processing",
        message:
          "La aprobación está en proceso. Actualiza el estado antes de realizar otra acción.",
      };
    }
    if (application.approval_state === "failed") {
      return {
        status: "error",
        message:
          "No se pudo terminar de habilitar la tienda. La solicitud sigue en revisión; comprueba el estado antes de reintentar.",
      };
    }
    return {
      status: "success",
      message:
        "Decisión guardada. El resultado está disponible en la cuenta del solicitante.",
    };
  } catch (error) {
    unstable_rethrow(error);
    return { status: "error", message: applicationServiceError(error) };
  }
}

export async function createProposedCategoryAction(
  id: string,
  _previous: CategoryProposalState,
  formData: FormData,
): Promise<CategoryProposalState> {
  const input = parseCategoryProposalInput(formData);
  if (!isApplicationId(id) || !input)
    return {
      status: "error",
      message:
        "Revisa el nombre de la categoría (hasta 120 caracteres) y recarga si la solicitud cambió.",
    };
  try {
    const { created } = await createProposedCategory(id, input);
    revalidatePath(`/dashboard/vendor-applications/${id}`);
    return {
      status: "success",
      message: created
        ? "Categoría añadida al catálogo público. La solicitud no fue aprobada ni modificada."
        : "Ya existe una categoría con ese identificador. No se creó un duplicado ni se modificó la categoría existente.",
    };
  } catch (error) {
    unstable_rethrow(error);
    return { status: "error", message: applicationServiceError(error) };
  }
}
