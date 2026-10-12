"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { HttpTypes } from "@medusajs/types";
import { requireAdminSdk } from "@/lib/auth-sdk";
import type { AuthActionState } from "@/lib/auth-utils";
import { profileReturnPath } from "./profile-completion";

export async function updateAccountProfileAction(
  _previous: AuthActionState,
  form: FormData,
): Promise<AuthActionState> {
  const firstName = form.get("first_name");
  const lastName = form.get("last_name");
  const next = form.get("next");
  if (typeof firstName !== "string" || !firstName.trim()) {
    return { status: "error", message: "Ingresa tu nombre para continuar." };
  }
  if (
    typeof firstName !== "string" ||
    typeof lastName !== "string" ||
    firstName.trim().length > 100 ||
    lastName.trim().length > 100
  ) {
    return {
      status: "error",
      message: "Usa hasta 100 caracteres para el nombre y el apellido.",
    };
  }
  try {
    const sdk = await requireAdminSdk();
    const { user } = await sdk.admin.user.me();
    await sdk.admin.user.update(user.id, {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
    } satisfies HttpTypes.AdminUpdateUser);
    revalidatePath("/dashboard", "layout");
  } catch {
    return {
      status: "error",
      message:
        "No pudimos guardar el perfil. Revisa tu acceso e inténtalo nuevamente.",
    };
  }
  if (typeof next === "string") redirect(profileReturnPath(next));
  return { status: "success", message: "Perfil actualizado." };
}
