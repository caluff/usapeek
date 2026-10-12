import { acquireLockStep, releaseLockStep } from "@medusajs/medusa/core-flows";
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import {
  confirmProductChangeWorkflow,
  stageProductChangeWorkflow,
  validateNoPendingProductChangeStep,
} from "@mercurjs/core/workflows";
import { catalogPermissionLock } from "../lib/catalog-permission/read";
import { catalogProductEditLock } from "../lib/catalog/product-edit-lock";
import { catalogMediaService } from "../lib/catalog-media/access";
import {
  VariantMediaUpdateSchema,
  variantMediaActions,
  type VariantMediaUpdate,
} from "../lib/catalog/variant-media";
import {
  prepareCatalogPermissionStep,
  type CatalogPermissionActor,
} from "./catalog-permission-prepare";

type Input = CatalogPermissionActor & {
  product_id: string;
  variant_id: string;
  body: VariantMediaUpdate;
};
const prepareVariantMediaStep = createStep(
  "prepare-variant-media",
  async (input: Input, { container }) => {
    const body = VariantMediaUpdateSchema.parse(input.body);
    const { data: gallery } = await container
      .resolve(ContainerRegistrationKeys.QUERY)
      .graph(
        {
          entity: "product_image",
          fields: ["id", "url", "rank", "variants.id"],
          filters: { product_id: input.product_id },
          pagination: { order: { rank: "ASC" } },
        },
        { cache: { enable: false } },
      );
    const urls = body.images.uploads.map((image) => image.url);
    const owned = await catalogMediaService(container).listCatalogImages({
      seller_id: input.seller_id,
      url: urls,
    });
    if (urls.some((url) => !owned.some((image) => image.url === url)))
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Catalog image access is not permitted.",
      );
    // Reserve IDs in one moderated change. Native confirmation creates the rows
    // before applying its variant image links, without publishing pending media.
    return new StepResponse(
      variantMediaActions(input.product_id, input.variant_id, body, gallery),
    );
  },
);

export const updateVariantMediaWorkflow = createWorkflow(
  "update-variant-media",
  function (input: Input) {
    const permissionLock = transform(input, ({ seller_id }) =>
      catalogPermissionLock(seller_id),
    );
    acquireLockStep(permissionLock);
    const productLock = transform(input, ({ product_id }) =>
      catalogProductEditLock(product_id),
    );
    acquireLockStep(productLock).config({
      name: "acquire-variant-media-product-lock",
    });
    const permission = prepareCatalogPermissionStep(
      transform(input, (input) => ({
        ...input,
        mode: "variant" as const,
        body: input.body.variant,
      })),
    );
    validateNoPendingProductChangeStep(
      transform(input, ({ product_id, seller_id }) => ({
        product_ids: [product_id],
        created_by: seller_id,
      })),
    );
    const actions = prepareVariantMediaStep(input);
    const change = stageProductChangeWorkflow.runAsStep({
      input: transform({ input, actions }, ({ input, actions }) => ({
        product_id: input.product_id,
        created_by: input.seller_id,
        actions,
      })),
    });
    when({ permission }, ({ permission }) => permission.authorized).then(() =>
      confirmProductChangeWorkflow.runAsStep({
        input: transform({ change, input }, ({ change, input }) => ({
          ids: [change.id],
          confirmed_by: input.seller_id,
          internal_note: "Cambio automático: tienda autorizada.",
        })),
      }),
    );
    releaseLockStep(productLock).config({
      name: "release-variant-media-product-lock",
    });
    releaseLockStep(permissionLock);
    return new WorkflowResponse(
      transform(change, (change) => ({ product_change_id: change.id })),
    );
  },
);
