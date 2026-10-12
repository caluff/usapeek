import type { MutationState } from "../workspace/presentation";
import { stockQuantity, textField } from "../workspace/validation";
import type { PresentationSaveState } from "./save-presentation";

export type PresentationStockSaveState = PresentationSaveState & {
  savedStock?: boolean;
};

export async function savePresentationAndStock(
  form: FormData,
  actions: {
    presentation: (form: FormData) => Promise<PresentationSaveState>;
    stock: (form: FormData) => Promise<MutationState>;
  },
  inventory?: {
    id: string;
    locationId: string;
    expected: number;
    reserved: number;
  },
): Promise<PresentationStockSaveState> {
  let saved: PresentationSaveState | undefined;
  try {
    const changeStock = form.get("change_stock") === "true";
    const quantity = changeStock
      ? stockQuantity(textField(form, "stocked_quantity", true))
      : undefined;
    if (
      changeStock &&
      (!inventory || quantity === undefined || quantity < inventory.reserved)
    )
      throw new Error(
        "Las existencias no pueden ser menores que las unidades reservadas.",
      );
    saved = await actions.presentation(form);
    if (
      saved.status !== "success" ||
      !changeStock ||
      !inventory ||
      quantity === undefined
    )
      return saved;
    const stockForm = new FormData();
    stockForm.set("id", inventory.id);
    stockForm.set("location_id", inventory.locationId);
    stockForm.set("expected_quantity", String(inventory.expected));
    stockForm.set("stocked_quantity", String(quantity));
    const result = await actions.stock(stockForm);
    const previousMessage =
      saved.savedVariant || saved.savedOffer ? (saved.message ?? "") + " " : "";
    return {
      ...saved,
      ...result,
      savedStock: result.status === "success",
      message:
        previousMessage +
        (result.status === "success"
          ? result.message
          : `Las existencias no se guardaron: ${result.message}`),
    };
  } catch (error) {
    return {
      status: "error",
      savedVariant: saved?.savedVariant,
      savedOffer: saved?.savedOffer,
      message: [
        saved?.savedVariant || saved?.savedOffer ? (saved.message ?? "") : "",
        error instanceof Error
          ? error.message
          : "No se pudieron guardar los cambios. Inténtalo de nuevo.",
      ]
        .filter(Boolean)
        .join(" "),
    };
  }
}
