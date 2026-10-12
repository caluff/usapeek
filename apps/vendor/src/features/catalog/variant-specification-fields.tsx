import { ProductAttributesFields } from "./product-attributes-fields";
import type { SpecificationDraft } from "./product-specifications";

export function VariantSpecificationFields({
  value,
  onChange,
  namePrefix = "",
}: {
  value: SpecificationDraft;
  onChange: (value: SpecificationDraft) => void;
  namePrefix?: string;
}) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-3 text-sm font-semibold">
        Atributos de la variante
      </legend>
      <ProductAttributesFields
        value={value}
        onChange={onChange}
        namePrefix={namePrefix}
        scope="variant"
      />
    </fieldset>
  );
}
