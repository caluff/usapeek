"use server";

import { revalidatePath } from "next/cache";
import { authorizeVendor, errorMessage } from "../workspace/data";
import type { MutationState } from "../workspace/presentation";
import { offerOperations, usdAmount } from "./operations";
import { resourceId, stockQuantity, textField } from "../workspace/validation";
import { editVariantAction } from "../catalog/actions";
import {
  savePresentationChanges,
  type PresentationSaveState,
} from "./save-presentation";

const operations = offerOperations(authorizeVendor);
export async function savePresentationAction(
  _previous: PresentationSaveState,
  form: FormData,
): Promise<PresentationSaveState> {
  try {
    if (form.get("change_variant") === "true") {
      textField(form, "title", true, 200);
      textField(form, "master_sku", true, 100);
    }
    if (form.get("change_offer") === "true") {
      usdAmount(textField(form, "amount", true));
      resourceId(textField(form, "shipping_profile_id", true));
      if (!form.get("offer_id"))
        stockQuantity(textField(form, "stocked_quantity", true));
    }
    return await savePresentationChanges(form, {
      variant: (data) => editVariantAction({ status: "idle" }, data),
      offer: (data) => saveOfferAction({ status: "idle" }, data),
    });
  } catch (error) {
    return { status: "error", message: errorMessage(error) };
  }
}
export async function saveOfferAction(
  _previous: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    const { offer } = form.get("offer_id")
      ? await operations.update(form)
      : await operations.create(form);
    revalidatePath(`/seller/catalog/${resourceId(offer.product_id)}`);
    revalidatePath("/seller/catalog");
    revalidatePath("/seller/inventory");
    revalidatePath("/seller", "layout");
    return {
      status: "success",
      message: form.get("offer_id")
        ? "Precio guardado."
        : "Precio y existencias iniciales guardados.",
    };
  } catch (error) {
    return { status: "error", message: errorMessage(error) };
  }
}
