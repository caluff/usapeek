import type { HttpTypes } from "@mercurjs/types";
import type { scopedClient } from "../workspace/operations";

export async function catalogCategories(client: ReturnType<typeof scopedClient>) {
  const categories: HttpTypes.VendorProductCategoryListResponse["product_categories"] =
    [];
  for (let offset = 0; ; offset += 100) {
    const response =
      await client.get<HttpTypes.VendorProductCategoryListResponse>(
        "/vendor/product-categories",
        {
          limit: 100,
          offset,
          fields: "id,name,is_active,is_internal",
          is_active: true,
          is_internal: false,
        },
      );
    categories.push(
      ...response.product_categories.filter(
        (category) => category.is_active && !category.is_internal,
      ),
    );
    if (
      !response.product_categories.length ||
      offset + response.product_categories.length >= response.count
    )
      return categories;
  }
}
