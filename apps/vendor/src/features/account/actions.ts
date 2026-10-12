"use server";

import { revalidatePath } from "next/cache";
import type { AccountEmailVerificationResponse } from "@usapeek/api/auth-contracts";
import { authorizeVendor } from "@/features/workspace/data";
import {
  clearVendorVerification,
  getVendorVerificationCode,
} from "@/lib/auth-sdk";
import type { VendorAuthActionState } from "@/lib/auth-utils";

export async function requestAccountEmailAction(): Promise<VendorAuthActionState> {
  try {
    const { sdk } = await authorizeVendor();
    await sdk.client.fetch("/auth/account/email-verification/request", {
      method: "POST",
      body: {},
    });
    await clearVendorVerification();
    revalidatePath("/seller/account");
    return {
      status: "success",
      message:
        "Solicitamos el enlace de verificación. Revisa tu correo y la carpeta de spam.",
    };
  } catch {
    return {
      status: "error",
      message:
        "No pudimos solicitar el enlace. Inténtalo de nuevo en unos momentos.",
    };
  }
}

export async function confirmAccountEmailAction(): Promise<VendorAuthActionState> {
  const code = await getVendorVerificationCode();
  if (!code)
    return {
      status: "error",
      message: "El enlace venció. Solicita uno nuevo.",
    };
  try {
    const { sdk } = await authorizeVendor();
    await sdk.client.fetch<AccountEmailVerificationResponse>(
      "/auth/account/email-verification/confirm",
      { method: "POST", body: { code } },
    );
    await clearVendorVerification();
    revalidatePath("/seller/account");
    return { status: "success", message: "Correo verificado." };
  } catch {
    return {
      status: "error",
      message:
        "El enlace no es válido para esta cuenta o ya venció. Solicita uno nuevo.",
    };
  }
}
