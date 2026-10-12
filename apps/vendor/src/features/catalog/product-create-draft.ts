import {
  variantCombinations,
  type CatalogAxis,
  type CatalogVariant,
} from "./validation";

export type CatalogOptionDraft = { title: string; values: string };

export function parseCatalogOptions(
  options: CatalogOptionDraft[],
): CatalogAxis[] {
  return options.map((option) => ({
    title: option.title.trim(),
    values: option.values
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  }));
}

function combinationKey(options: Record<string, string>) {
  return JSON.stringify(
    Object.entries(options).sort(([a], [b]) => a.localeCompare(b)),
  );
}

export function createVariantDrafts(
  axes: CatalogAxis[],
  previous: CatalogVariant[],
): CatalogVariant[] {
  if (!axes.length)
    throw new Error("Añade al menos una opción para crear variantes.");
  const existing = new Map(
    previous.map((variant) => [combinationKey(variant.options), variant]),
  );
  return variantCombinations(axes).map(
    (options) =>
      existing.get(combinationKey(options)) ?? {
        title: Object.values(options).join(" / ").slice(0, 200),
        sku: "",
        options,
      },
  );
}

export function singleVariantDraft(title = ""): CatalogVariant {
  return { title: title.trim(), sku: "", options: {} };
}
