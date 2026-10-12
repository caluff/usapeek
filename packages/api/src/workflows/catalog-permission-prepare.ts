import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import {
  ContainerRegistrationKeys,
  MedusaError,
  ProductStatus,
} from "@medusajs/framework/utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ProductChangeActionType } from "@mercurjs/types";
import { readCatalogPermission } from "../lib/catalog-permission/read";
import { validateCatalogMutation } from "../lib/catalog/product-validation";
import { requireVendorAccess } from "../lib/vendor-onboarding/access";

export type CatalogPermissionActor = {
  seller_id: string;
  member_id: string;
};

type Input = CatalogPermissionActor & {
  mode: "create" | "update" | "variant" | "attributes";
  body: unknown;
  product_id?: string;
  variant_id?: string;
};

async function assertAutomaticallyReviewableProduct(
  container: MedusaContainer,
  sellerId: string,
  productId: string,
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const [{ data: products }, { data: additions }, { data: restrictions }] =
    await Promise.all([
      query.graph(
        {
          entity: "product",
          fields: ["id", "status"],
          filters: { id: productId },
        },
        { cache: { enable: false } },
      ),
      query.graph(
        {
          entity: "product_change_action",
          fields: ["id"],
          filters: {
            product_id: productId,
            action: ProductChangeActionType.PRODUCT_ADD,
            product_change: { created_by: sellerId },
          },
        },
        { cache: { enable: false } },
      ),
      query.graph(
        {
          entity: "product_seller",
          fields: ["seller_id"],
          filters: { product_id: productId },
        },
        { cache: { enable: false } },
      ),
    ]);
  const product = products[0];
  // Match the native vendor list: own submissions, or published masters
  // whose seller allowlist permits this store.
  const isVisiblePublishedProduct =
    product?.status === ProductStatus.PUBLISHED &&
    (!restrictions.length ||
      restrictions.some((restriction) => restriction.seller_id === sellerId));
  if (!product || (!additions.length && !isVisiblePublishedProduct)) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Este producto no está disponible para los cambios de esta tienda.",
    );
  }
}

export const prepareCatalogPermissionStep = createStep(
  "prepare-catalog-permission",
  async (input: Input, { container }) => {
    await requireVendorAccess(container, input.member_id, input.seller_id);
    const permission = await readCatalogPermission(container, input.seller_id);
    if (permission.mode === "authorized" && input.product_id) {
      await assertAutomaticallyReviewableProduct(
        container,
        input.seller_id,
        input.product_id,
      );
    }
    await validateCatalogMutation(container, input);
    return new StepResponse({ authorized: permission.mode === "authorized" });
  },
);
