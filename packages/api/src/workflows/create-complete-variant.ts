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
  generateEntityId,
  MedusaError,
} from "@medusajs/framework/utils";
import {
  ProductChangeActionType,
  type CreateProductChangeActionDTO,
} from "@mercurjs/types";
import {
  stageProductChangeWorkflow,
  validateNoPendingProductChangeStep,
} from "@mercurjs/core/workflows";
import { catalogPermissionLock } from "../lib/catalog-permission/read";
import { catalogProductEditLock } from "../lib/catalog/product-edit-lock";
import {
  CreateCompleteVariantSchema,
  requireInitialVariantOfferResources,
  type CreateCompleteVariant,
} from "../lib/catalog/create-complete-variant";
import { readCatalogOptions } from "../lib/catalog/product-options";
import {
  validateCatalogVariantFields,
  validateCombinations,
} from "../lib/catalog/product-validation";
import { catalogMediaService } from "../lib/catalog-media/access";
import { variantMediaActions } from "../lib/catalog/variant-media";
import {
  prepareCatalogPermissionStep,
  type CatalogPermissionActor,
} from "./catalog-permission-prepare";
import { confirmCompleteCatalogProductChangeWorkflow } from "./confirm-complete-catalog-product-change";

type Input = CatalogPermissionActor & {
  product_id: string;
  body: CreateCompleteVariant;
};
const prepareCompleteVariantStep = createStep(
  "prepare-complete-variant",
  async (input: Input, { container }) => {
    const body = CreateCompleteVariantSchema.parse(input.body);
    const fields = validateCatalogVariantFields(body.variant);
    if (!fields.title || !fields.sku || body.variant.manage_inventory === true)
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "La variante necesita nombre y código interno válidos.",
      );
    const current = await readCatalogOptions(container, input.product_id);
    if (current.variants.some((variant) => variant.sku === fields.sku))
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Duplicate master SKU.",
      );
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const [{ data: attributes }, { data: gallery }] = await Promise.all([
      query.graph(
        {
          entity: "product_attribute",
          fields: [
            "id",
            "product_id",
            "product_option_id",
            "is_variant_axis",
            "is_active",
            "values.id",
            "values.name",
          ],
          filters: {
            product_option_id: current.options.map((option) => option.id),
          },
        },
        { cache: { enable: false } },
      ),
      query.graph(
        {
          entity: "product_image",
          fields: ["id", "url", "rank", "variants.id"],
          filters: { product_id: input.product_id },
          pagination: { order: { rank: "ASC" } },
        },
        { cache: { enable: false } },
      ),
    ]);
    const updates: { id: string; add: (string | { value: string })[] }[] = [];
    const axes = current.options.map((option) => {
      const values = (option.values ?? []).map((value) => value.value);
      const requested = fields.options?.[option.title];
      if (requested && !values.includes(requested)) {
        const attribute = attributes.find(
          (attribute) =>
            attribute.product_option_id === option.id &&
            attribute.is_variant_axis &&
            attribute.is_active,
        );
        if (
          !attribute ||
          (attribute.product_id && attribute.product_id !== input.product_id)
        )
          throw new MedusaError(
            MedusaError.Types.NOT_ALLOWED,
            "Esta opción no admite nuevos valores para este producto.",
          );
        const known = attribute.values?.find(
          (value) => value?.name === requested,
        );
        if (!attribute.product_id && !known)
          throw new MedusaError(
            MedusaError.Types.NOT_ALLOWED,
            "Solicita al operador el nuevo valor de esta opción compartida.",
          );
        updates.push({
          id: attribute.id,
          add: known ? [known.id] : [{ value: requested }],
        });
        values.push(requested);
      }
      return { title: option.title, values };
    });
    validateCombinations(axes, [
      ...current.variants.map((variant) => ({
        options: Object.fromEntries(
          (variant.options ?? []).map((value) => [
            value.option?.title ?? "",
            value.value,
          ]),
        ),
      })),
      fields,
    ]);
    await requireInitialVariantOfferResources(
      container,
      input.seller_id,
      body.offer.shipping_profile_id,
    );
    const urls = body.images.uploads.map((image) => image.url);
    const owned = urls.length
      ? await catalogMediaService(container).listCatalogImages({
          seller_id: input.seller_id,
          url: urls,
        })
      : [];
    if (urls.some((url) => !owned.some((image) => image.url === url)))
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Catalog image access is not permitted.",
      );
    const variantId = generateEntityId(undefined, "variant");
    const media = variantMediaActions(
      input.product_id,
      variantId,
      { variant: {}, images: body.images },
      gallery,
    );
    const actions: Omit<CreateProductChangeActionDTO, "product_change_id">[] = [
      ...updates.map((update) => ({
        product_id: input.product_id,
        action: ProductChangeActionType.ATTRIBUTE_UPDATE,
        details: { update, attribute_id: update.id },
      })),
      ...media.filter(
        (action) => action.action === ProductChangeActionType.UPDATE,
      ),
      {
        product_id: input.product_id,
        action: ProductChangeActionType.VARIANT_ADD,
        details: {
          variant: {
            ...body.variant,
            ...fields,
            id: variantId,
            manage_inventory: false,
          },
          initial_offer: {
            ...body.offer,
            seller_id: input.seller_id,
            member_id: input.member_id,
            variant_id: variantId,
            variant_sku: fields.sku,
          },
        },
      },
      ...media.filter(
        (action) => action.action === ProductChangeActionType.VARIANT_UPDATE,
      ),
    ];
    return new StepResponse(actions);
  },
);

export const createCompleteVariantWorkflow = createWorkflow(
  "create-complete-variant",
  function (input: Input) {
    const permissionLock = transform(input, ({ seller_id }) =>
      catalogPermissionLock(seller_id),
    );
    acquireLockStep(permissionLock);
    const productLock = transform(input, ({ product_id }) =>
      catalogProductEditLock(product_id),
    );
    acquireLockStep(productLock).config({
      name: "acquire-complete-variant-product-lock",
    });
    const permission = prepareCatalogPermissionStep(
      transform(input, (input) => ({
        ...input,
        mode: "attributes" as const,
        body: {},
      })),
    );
    validateNoPendingProductChangeStep(
      transform(input, ({ product_id, seller_id }) => ({
        product_ids: [product_id],
        created_by: seller_id,
      })),
    );
    const actions = prepareCompleteVariantStep(input);
    const change = stageProductChangeWorkflow.runAsStep({
      input: transform({ input, actions }, ({ input, actions }) => ({
        product_id: input.product_id,
        created_by: input.seller_id,
        actions,
      })),
    });
    when({ permission }, ({ permission }) => permission.authorized).then(() =>
      confirmCompleteCatalogProductChangeWorkflow.runAsStep({
        input: transform({ change, input }, ({ change, input }) => ({
          id: change.id,
          confirmed_by: input.seller_id,
          internal_note: "Cambio automático: tienda autorizada.",
        })),
      }),
    );
    releaseLockStep(productLock).config({
      name: "release-complete-variant-product-lock",
    });
    releaseLockStep(permissionLock);
    return new WorkflowResponse(
      transform(change, (change) => ({ product_change_id: change.id })),
    );
  },
);
