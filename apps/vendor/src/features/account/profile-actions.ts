"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { HttpTypes, MemberDTO } from "@mercurjs/types";
import { authorizeVendor } from "@/features/workspace/data";
import { scopedClient } from "@/features/workspace/operations";
import type { VendorAuthActionState } from "@/lib/auth-utils";
import { profileReturnPath } from "./profile-completion";

export async function updateAccountProfileAction(
  _previous: VendorAuthActionState,
  form: FormData,
): Promise<VendorAuthActionState> {
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
    const account = await authorizeVendor();
    await scopedClient(account).post<HttpTypes.VendorSellerMemberResponse>(
      "/vendor/members/me",
      {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      } satisfies Pick<MemberDTO, "first_name" | "last_name">,
    );
    revalidatePath("/seller", "layout");
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
