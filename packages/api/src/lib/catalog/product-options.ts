import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

export async function readCatalogOptions(
  container: MedusaContainer,
  productId: string,
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  // Populate from the option side: product.options has a known native joiner
  // issue in this installed Mercur/Medusa combination (vendor query-config).
  const [
    { data: options },
    { data: variants },
    { data: products },
    { data: images },
  ] = await Promise.all([
    query.graph(
      {
        entity: "product_option",
        fields: ["id", "title", "values.id", "values.value"],
        filters: { products: { id: productId } },
      },
      { cache: { enable: false } },
    ),
    query.graph(
      {
        entity: "product_variant",
        fields: [
          "id",
          "title",
          "sku",
          "product_id",
          "material",
          "weight",
          "length",
          "width",
          "height",
          "origin_country",
          "hs_code",
          "mid_code",
          "created_at",
          "updated_at",
          "options.id",
          "options.value",
          "options.option.title",
        ],
        filters: { product_id: productId },
      },
      { cache: { enable: false } },
    ),
    query.graph(
      {
        entity: "product",
        fields: [
          "id",
          "material",
          "weight",
          "length",
          "width",
          "height",
          "origin_country",
          "hs_code",
          "mid_code",
          "product_attribute_values.product_option_value_id",
          "product_attribute_values.attribute.product_option_id",
        ],
        filters: { id: productId },
      },
      { cache: { enable: false } },
    ),
    query.graph(
      {
        entity: "product_image",
        fields: ["id", "url", "rank", "variants.id"],
        filters: { product_id: productId },
        pagination: { order: { rank: "ASC" } },
      },
      { cache: { enable: false } },
    ),
  ]);
  const selected = products[0]?.product_attribute_values ?? [];
  const product = products[0];
  return {
    product: product
      ? {
          id: product.id,
          material: product.material,
          weight: product.weight,
          length: product.length,
          width: product.width,
          height: product.height,
        }
      : null,
    options: options.map((option) => {
      const values = selected.filter(
        (value) => value?.attribute?.product_option_id === option.id,
      );
      const allowed = new Set(
        values.map((value) => value?.product_option_value_id),
      );
      return {
        ...option,
        values:
          option.title === "__default__"
            ? option.values
            : (option.values ?? []).filter((value) => allowed.has(value.id)),
      };
    }),
    // Medusa's variant.images includes unassigned general images. The editor
    // needs only the persisted assignments to calculate add/remove correctly.
    variants: variants.map((variant) => ({
      ...variant,
      images: images
        .filter((image) =>
          (image.variants ?? []).some(
            (assigned) => assigned?.id === variant.id,
          ),
        )
        .map(({ id, url, rank }) => ({ id, url, rank })),
    })),
  };
}
