"use server";

import { FetchError } from "@medusajs/js-sdk";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireAdminSdk } from "@/lib/auth-sdk";
import { categoryErrorMessage, type CategoryState } from "./helpers";
import { createCategory } from "./operations";

export async function createCategoryAction(
  _previous: CategoryState,
  formData: FormData,
): Promise<CategoryState> {
  try {
    const sdk = await requireAdminSdk();
    const result = await createCategory(sdk.admin.productCategory, formData);
    if (result.status === "success") revalidatePath("/dashboard/categories");
    return result;
  } catch (error) {
    unstable_rethrow(error);
    return {
      status: "error",
      message: categoryErrorMessage(
        error instanceof FetchError ? error.status : undefined,
      ),
    };
  }
}
