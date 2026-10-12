import type {
  CreateProductVariantDTO,
  HttpTypes,
  ProductVariantDTO,
} from "@medusajs/types";
import { textField } from "../workspace/validation";

export const PRODUCT_MEASUREMENTS = [
  { name: "weight", label: "Peso (g)" },
  { name: "length", label: "Largo (mm)" },
  { name: "width", label: "Ancho (mm)" },
  { name: "height", label: "Alto (mm)" },
] as const;

export const PRODUCT_TEXT_ATTRIBUTES = [
  { name: "material", label: "Material" },
  { name: "origin_country", label: "País de origen" },
  { name: "hs_code", label: "Código arancelario (HS)" },
  { name: "mid_code", label: "Código del fabricante (MID)" },
] as const;

export type SpecificationField =
  | (typeof PRODUCT_TEXT_ATTRIBUTES)[number]["name"]
  | (typeof PRODUCT_MEASUREMENTS)[number]["name"];
type CreateSpecifications = Pick<
  HttpTypes.AdminCreateProduct,
  SpecificationField
>;
type UpdateSpecifications = Pick<
  HttpTypes.AdminUpdateProduct,
  SpecificationField
>;
type VariantSpecifications = Pick<CreateProductVariantDTO, SpecificationField>;
export type SpecificationDraft = Record<SpecificationField, string>;

export function specificationDraft(
  values: Partial<Pick<ProductVariantDTO, SpecificationField>> = {},
): SpecificationDraft {
  return {
    material: values.material ?? "",
    origin_country: values.origin_country ?? "",
    hs_code: values.hs_code ?? "",
    mid_code: values.mid_code ?? "",
    weight: values.weight == null ? "" : String(values.weight),
    length: values.length == null ? "" : String(values.length),
    width: values.width == null ? "" : String(values.width),
    height: values.height == null ? "" : String(values.height),
  };
}

export function variantSpecifications(
  values: FormData | Record<string, unknown>,
  mode: "create" | "update",
): VariantSpecifications {
  const form = values instanceof FormData ? values : new FormData();
  if (!(values instanceof FormData)) {
    for (const name of [
      ...PRODUCT_TEXT_ATTRIBUTES.map(({ name }) => name),
      ...PRODUCT_MEASUREMENTS.map(({ name }) => name),
    ]) {
      if (!(name in values)) continue;
      const value = values[name];
      if (
        (typeof value !== "string" &&
          typeof value !== "number" &&
          value !== null) ||
        (PRODUCT_TEXT_ATTRIBUTES.some((attribute) => attribute.name === name) &&
          typeof value === "number")
      )
        throw new Error("Los atributos de la variante no son válidos.");
      form.set(name, value === null ? "" : String(value));
    }
  }
  return mode === "create"
    ? productSpecifications(form, "create")
    : productSpecifications(form, "update");
}

export function productSpecifications(
  form: FormData,
  mode: "create",
): CreateSpecifications;
export function productSpecifications(
  form: FormData,
  mode: "update",
): UpdateSpecifications;
export function productSpecifications(
  form: FormData,
  mode: "create" | "update",
): UpdateSpecifications {
  const specifications: UpdateSpecifications = {};
  for (const { name } of PRODUCT_TEXT_ATTRIBUTES) {
    if (!form.has(name)) continue;
    const value = textField(form, name, false, 200);
    if (name === "origin_country" && value && !/^[a-zA-Z]{2}$/.test(value))
      throw new Error("Introduce un código de país de dos letras, como US.");
    if (value) specifications[name] = value;
    else if (mode === "update") specifications[name] = null;
  }
  for (const { name, label } of PRODUCT_MEASUREMENTS) {
    if (!form.has(name)) continue;
    const raw = textField(form, name, false, 32);
    if (!raw) {
      if (mode === "update") specifications[name] = null;
      continue;
    }
    const value = Number(raw);
    if (
      !/^\d+(?:\.\d+)?$/.test(raw) ||
      !Number.isFinite(value) ||
      value <= 0 ||
      value > Number.MAX_SAFE_INTEGER
    ) {
      throw new Error(
        `Indica un valor mayor a cero para ${label.toLowerCase()}.`,
      );
    }
    specifications[name] = value;
  }
  return specifications;
}
