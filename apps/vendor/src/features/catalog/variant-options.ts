import type { ProductDTO, ProductVariantDTO } from "@mercurjs/types";

type ProductOption = NonNullable<ProductDTO["options"]>[number];
type OptionValue = NonNullable<ProductVariantDTO["options"]>[number];
type VariantSelection = Pick<ProductVariantDTO, "id"> & {
  options?: (Pick<OptionValue, "option_id" | "value"> & {
    option?: Pick<ProductOption, "title"> | null;
  })[];
};
type VariantOptionsProduct = {
  options?: (Pick<ProductOption, "id" | "title"> & {
    values?: Pick<OptionValue, "value">[];
  })[];
  variants?: VariantSelection[];
};

export function hasPresentationOptions(product: VariantOptionsProduct) {
  return (product.options ?? []).some(
    (option) => option.title !== "__default__",
  );
}

export function variantOptionValues(
  product: VariantOptionsProduct,
  variant: VariantSelection,
) {
  return (product.options ?? []).map(
    (option) =>
      variant.options?.find(
        (value) =>
          value.option_id === option.id || value.option?.title === option.title,
      )?.value ?? "",
  );
}

export function hasVariantCombination(
  product: VariantOptionsProduct,
  selected: string[],
  excludeVariantId?: string,
) {
  return (product.variants ?? []).some(
    (variant) =>
      variant.id !== excludeVariantId &&
      JSON.stringify(variantOptionValues(product, variant)) ===
        JSON.stringify(selected),
  );
}

export function nextVariantOptions(product: VariantOptionsProduct) {
  const options = product.options ?? [];
  const used = new Set(
    (product.variants ?? []).map((variant) =>
      JSON.stringify(variantOptionValues(product, variant)),
    ),
  );
  const selected: string[] = [];

  function find(index: number): string[] | null {
    if (index === options.length) {
      return used.has(JSON.stringify(selected)) ? null : [...selected];
    }
    for (const value of options[index].values ?? []) {
      selected.push(value.value);
      const match = find(index + 1);
      selected.pop();
      if (match) return match;
    }
    return null;
  }

  return find(0);
}

export function newVariantOptionDraft(product: VariantOptionsProduct) {
  const available = nextVariantOptions(product);
  let needsNewValue = available === null;
  return (product.options ?? []).map((option, index) => {
    const isNew =
      option.title !== "__default__" &&
      (needsNewValue || !option.values?.length);
    if (isNew) needsNewValue = false;
    return {
      isNew,
      value: isNew
        ? ""
        : (available?.[index] ?? option.values?.[0]?.value ?? ""),
    };
  });
}
