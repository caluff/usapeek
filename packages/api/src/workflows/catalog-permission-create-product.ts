import {
  acquireLockStep,
  releaseLockStep,
  useQueryGraphStep,
} from "@medusajs/medusa/core-flows";
import {
  createWorkflow,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import {
  confirmProductsWorkflow,
  createOffersWorkflow,
  createProductsWorkflow,
} from "@mercurjs/core/workflows";
import type { VendorCreateProductType } from "@mercurjs/core/api/vendor/products/validators";
import { AttributeType } from "@mercurjs/types";
import { catalogPermissionLock } from "../lib/catalog-permission/read";
import {
  prepareCatalogPermissionStep,
  type CatalogPermissionActor,
} from "./catalog-permission-prepare";
import {
  prepareInitialProductExtrasStep,
  validateInitialProductExtrasStep,
} from "./steps/prepare-initial-product-extras";
import { linkInitialVariantImagesStep } from "./steps/link-initial-variant-images";

type Input = CatalogPermissionActor & { product: VendorCreateProductType };

export const catalogPermissionCreateProductWorkflow = createWorkflow(
  "catalog-permission-create-product",
  function (input: Input) {
    const lock = transform(input, ({ seller_id }) =>
      catalogPermissionLock(seller_id),
    );
    acquireLockStep(lock);
    const permission = prepareCatalogPermissionStep(
      transform(input, ({ seller_id, member_id, product }) => ({
        seller_id,
        member_id,
        mode: "create" as const,
        body: product,
      })),
    );
    const extras = validateInitialProductExtrasStep(input.product);
    const products = createProductsWorkflow.runAsStep({
      input: transform(
        { input, extras },
        ({ input: { seller_id, product } }) => {
          const { additional_data, attributes, ...payload } = product;
          return {
            products: [{ ...payload, attributes: attributes?.map((attribute) =>
              "title" in attribute ? { ...attribute, type: attribute.type === undefined ? undefined :
                Object.values(AttributeType).find((value) => value === attribute.type) } : attribute,
            ) }],
            created_by: seller_id,
            additional_data,
          };
        },
      ),
    });
    const { data: savedProducts } = useQueryGraphStep({
      entity: "product",
      fields: ["id", "variants.id", "variants.sku", "images.id", "images.url"],
      filters: transform({ products }, ({ products }) => ({
        id: products[0].id,
      })),
      options: { cache: { enable: false } },
    }).config({ name: "get-initial-product-variants-and-images" });
    const initial = prepareInitialProductExtrasStep(
      transform(
        { extras, savedProducts, input },
        ({ extras, savedProducts, input }) => ({
          extras,
          variants: (savedProducts[0].variants ?? []).flatMap((variant) =>
            variant ? [{ id: variant.id, sku: variant.sku }] : [],
          ),
          images: (savedProducts[0].images ?? []).flatMap((image) =>
            image ? [{ id: image.id, url: image.url }] : [],
          ),
          seller_id: input.seller_id,
          member_id: input.member_id,
        }),
      ),
    );
    linkInitialVariantImagesStep(initial.images);
    when({ initial }, ({ initial }) => initial.offers.length > 0).then(() =>
      createOffersWorkflow.runAsStep({ input: { offers: initial.offers } }),
    );
    when({ permission }, ({ permission }) => permission.authorized).then(() =>
      confirmProductsWorkflow.runAsStep({
        input: transform({ products, input }, ({ products, input }) => ({
          product_ids: products.map((product) => product.id),
          actor_id: input.seller_id,
          internal_note: "Publicación automática: tienda autorizada.",
        })),
      }),
    );
    releaseLockStep(lock);
    return new WorkflowResponse(
      transform({ products }, ({ products }) => ({
        product_id: products[0].id,
      })),
    );
  },
);
