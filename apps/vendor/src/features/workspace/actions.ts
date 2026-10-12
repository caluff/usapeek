"use server";

import { revalidatePath } from "next/cache";
import { ProductChangeStatus, ProductStatus } from "@mercurjs/types";
import { authorizeVendor, errorMessage } from "./data";
import { vendorOperations } from "./operations";
import type { MutationState } from "./presentation";
import { resourceId, textField } from "./validation";

const operations = vendorOperations(authorizeVendor);

export async function createLocationAction(
  _previous: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    await operations.createLocation(form);
    revalidatePath("/seller", "layout");
    return {
      status: "success",
      message:
        "Ubicación creada y vinculada a tu tienda. La configuración de envíos se gestiona por separado.",
    };
  } catch (error) {
    return { status: "error", message: errorMessage(error) };
  }
}

export async function createProductAction(
  _previous: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    const { product } = await operations.createProduct(form);
    revalidatePath("/seller", "layout");
    revalidatePath("/seller/catalog");
    return {
      status: "success",
      message:
        product.status === ProductStatus.PUBLISHED
          ? "Producto publicado."
          : "Producto enviado a aprobación. Todavía no está publicado.",
      href: `/seller/catalog/${product.id}`,
    };
  } catch (error) {
    return { status: "error", message: errorMessage(error) };
  }
}

export async function editProductAction(
  _previous: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    const { product_change } = await operations.editProduct(form);
    revalidatePath(
      `/seller/catalog/${resourceId(textField(form, "id", true))}`,
    );
    revalidatePath("/seller/catalog");
    return {
      status: "success",
      message:
        product_change.status === ProductChangeStatus.CONFIRMED
          ? "Cambios del producto guardados."
          : "Cambios enviados a revisión. El producto se actualizará cuando el administrador los apruebe.",
    };
  } catch (error) {
    return { status: "error", message: errorMessage(error) };
  }
}

export async function updateStockAction(
  _previous: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    await operations.updateStock(form);
    revalidatePath("/seller/inventory");
    revalidatePath("/seller", "layout");
    return { status: "success", message: "Existencias actualizadas." };
  } catch (error) {
    return { status: "error", message: errorMessage(error) };
  }
}

export async function updateProfileAction(
  _previous: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    await operations.updateProfile(form);
    revalidatePath("/seller", "layout");
    return { status: "success", message: "Perfil de la tienda actualizado." };
  } catch (error) {
    return { status: "error", message: errorMessage(error) };
  }
}

export async function updateAddressAction(
  _previous: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    await operations.updateAddress(form);
    revalidatePath("/seller/settings");
    revalidatePath("/seller");
    return { status: "success", message: "Dirección comercial actualizada." };
  } catch (error) {
    return { status: "error", message: errorMessage(error) };
  }
}

export async function updateCompanyAction(
  _previous: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    await operations.updateCompany(form);
    revalidatePath("/seller/settings");
    return {
      status: "success",
      message: "Información de la empresa actualizada.",
    };
  } catch (error) {
    return { status: "error", message: errorMessage(error) };
  }
}
