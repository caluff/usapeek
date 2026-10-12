import type { ShippingCoverage } from "@usapeek/api/shipping-contracts";
import { US_STATES, normalizeUsState } from "@usapeek/ui/us-states";
import { textField } from "../workspace/validation";

export function shippingCoverage(form: FormData): ShippingCoverage {
  const mode = textField(form, "coverage_mode", true);
  if (mode === "all") return { mode: "all" };
  if (mode !== "states") throw new Error("Selecciona una cobertura válida.");
  const values = form.getAll("coverage_state");
  const states = values.map((value) => {
    const code = typeof value === "string" ? normalizeUsState(value) : "";
    const state = US_STATES.find((entry) => entry.value === code);
    if (!state)
      throw new Error("Selecciona al menos un estado válido para esta tarifa.");
    return state.value;
  });
  if (
    !states.length ||
    states.length > US_STATES.length ||
    states.some((state) => !state)
  )
    throw new Error("Selecciona al menos un estado válido para esta tarifa.");
  return { mode: "states", states: [...new Set(states)].sort() };
}

export function shippingCoverageLabel(states: readonly string[] | null) {
  if (states === null) return "Todos los estados";
  if (states.length <= 2)
    return states
      .map(
        (code) =>
          US_STATES.find((state) => state.value === code)?.label ??
          code.toUpperCase(),
      )
      .join(", ");
  return `${states.length} estados`;
}
