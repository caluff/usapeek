import type { MutationState } from "../workspace/presentation";

export type PresentationSaveState = MutationState & {
  savedVariant?: boolean;
  savedOffer?: boolean;
};

export async function savePresentationChanges(
  form: FormData,
  actions: {
    variant: (form: FormData) => Promise<MutationState>;
    offer: (form: FormData) => Promise<MutationState>;
  },
): Promise<PresentationSaveState> {
  let variantResult: MutationState | undefined;
  if (form.get("change_variant") === "true") {
    variantResult = await actions.variant(form);
    if (variantResult.status !== "success") return variantResult;
  }
  if (form.get("change_offer") === "true") {
    const offerResult = await actions.offer(form);
    if (offerResult.status !== "success")
      return {
        ...offerResult,
        savedVariant: variantResult?.status === "success",
        message: variantResult
          ? `${variantResult.message} El precio y el envío no se guardaron: ${offerResult.message}`
          : offerResult.message,
      };
    return {
      status: "success",
      savedVariant: Boolean(variantResult),
      savedOffer: true,
      message: variantResult
        ? `${variantResult.message} Precio y envío guardados.`
        : "Precio y envío guardados.",
    };
  }
  return variantResult
    ? { ...variantResult, savedVariant: true }
    : { status: "success", message: "No hay cambios para guardar." };
}
