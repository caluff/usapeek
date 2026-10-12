"use server";

import { FetchError } from "@medusajs/js-sdk";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireAdminSdk } from "@/lib/auth-sdk";
import { commissionErrorMessage, type CommissionState } from "./helpers";
import { saveDefaultCommission } from "./operations";

export async function updateCommissionAction(
  _previous: CommissionState,
  formData: FormData,
): Promise<CommissionState> {
  try {
    const sdk = await requireAdminSdk();
    const result = await saveDefaultCommission(sdk.client, formData);
    if (result.status === "success") revalidatePath("/dashboard/commissions");
    return result;
  } catch (error) {
    unstable_rethrow(error);
    return {
      status: "error",
      message: commissionErrorMessage(
        error instanceof FetchError ? error.status : undefined,
      ),
    };
  }
}
