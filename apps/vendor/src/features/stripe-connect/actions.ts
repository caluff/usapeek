"use server";

import { authorizeVendor, errorMessage } from "../workspace/data";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { FetchError } from "@medusajs/js-sdk";
import { beginStripeOnboarding, refreshStripeAccount } from "./operations";

export type StripeRefreshState = {
  status: "idle" | "success" | "warning" | "error";
  message?: string;
};

export async function refreshStripeAccountAction(): Promise<StripeRefreshState> {
  try {
    const { payout_account: account } =
      await refreshStripeAccount(authorizeVendor);
    revalidatePath("/seller/settings/payments");
    return {
      status: account.status === "active" ? "success" : "warning",
      message:
        account.status === "active"
          ? "Stripe confirmó que tu cuenta está habilitada en el entorno de pruebas."
          : account.status === "rejected"
            ? "Estado verificado: Stripe rechazó la cuenta. Contacta al administrador."
            : "Estado verificado: la cuenta aún no está habilitada. Revisa los requisitos en Stripe.",
    };
  } catch (error) {
    unstable_rethrow(error);
    return {
      status: "error",
      message:
        error instanceof FetchError && error.status === 403
          ? "Tu rol o el estado de la tienda no permite actualizar la cuenta de cobros."
          : "No se pudo verificar la cuenta con Stripe. El estado mostrado no se ha confirmado de nuevo; puedes reintentar manualmente.",
    };
  }
}

export type StripeOnboardingState =
  | { status: "idle"; message?: never; url?: never }
  | { status: "success"; message: string; url: string }
  | { status: "error"; message: string; url?: never };

export async function startStripeOnboardingAction(): Promise<StripeOnboardingState> {
  try {
    const url = await beginStripeOnboarding(authorizeVendor);
    return {
      status: "success",
      message: "Abriendo la configuración segura de Stripe.",
      url,
    };
  } catch (error) {
    unstable_rethrow(error);
    return { status: "error", message: errorMessage(error) };
  }
}
