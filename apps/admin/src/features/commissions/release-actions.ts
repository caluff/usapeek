"use server";

import { FetchError } from "@medusajs/js-sdk";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireAdminSdk } from "@/lib/auth-sdk";
import {
  releaseSettingsErrorMessage,
  saveReleaseSettings,
} from "./release-settings";
import type { CommissionState } from "./helpers";

export async function updateReleaseSettingsAction(
  _previous: CommissionState,
  formData: FormData,
): Promise<CommissionState> {
  try {
    const sdk = await requireAdminSdk();
    const result = await saveReleaseSettings(sdk.client, formData);
    if (result.status === "success") revalidatePath("/dashboard/commissions");
    return result;
  } catch (error) {
    unstable_rethrow(error);
    return {
      status: "error",
      message: releaseSettingsErrorMessage(
        error instanceof FetchError ? error.status : undefined,
      ),
    };
  }
}
