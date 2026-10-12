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
  applyProductAttributeChangeActionsWorkflow,
  confirmProductChangeWorkflow,
  createOffersWorkflow,
  updateProductChangeActionsStep,
} from "@mercurjs/core/workflows";
import { ProductChangeActionType, ProductChangeStatus } from "@mercurjs/types";
import type { ProductAttributeBatchUpdate } from "@mercurjs/types";
import { z } from "@medusajs/framework/zod";
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows";
import {
  StagedVariantOfferSchema,
  requireInitialVariantOfferResources,
} from "../lib/catalog/create-complete-variant";
import { prepareInitialProductExtrasStep } from "./steps/prepare-initial-product-extras";
import {
  prepareProductGalleryChangeStep,
  unlinkProductGalleryVariantsStep,
} from "./steps/prepare-product-gallery-change";

type Input = {
  id: string;
  confirmed_by: string;
  internal_note?: string;
  additional_data?: Record<string, unknown>;
};
const attributeUpdateSchema = z.strictObject({
  id: z.string().min(1),
  add: z
    .array(
      z.union([
        z.string().min(1),
        z.strictObject({ value: z.string().trim().min(1).max(200) }),
      ]),
    )
    .min(1),
});
const prepareCompleteCatalogConfirmationStep = createStep(
  "prepare-complete-catalog-confirmation",
  async (input: Input, { container }) => {
    const { data: changes } = await container
      .resolve(ContainerRegistrationKeys.QUERY)
      .graph(
        {
          entity: "product_change",
          fields: [
            "id",
            "product_id",
            "created_by",
            "status",
            "actions.id",
            "actions.action",
            "actions.details",
            "actions.applied",
          ],
          filters: { id: input.id },
        },
        { cache: { enable: false }, throwIfKeyNotFound: true },
      );
    const change = changes[0];
    if (change.status !== ProductChangeStatus.PENDING)
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Only pending changes can be confirmed.",
      );
    const additions = (change.actions ?? []).filter(
      (action) =>
        action?.action === ProductChangeActionType.VARIANT_ADD &&
        action.details?.initial_offer,
    );
    if (additions.length > 1)
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Invalid complete variant change.",
      );
    const action = additions[0];
    const offer = action
      ? StagedVariantOfferSchema.parse(action.details?.initial_offer)
      : undefined;
    if (offer) {
      const variant = z
        .object({ id: z.string(), sku: z.string() })
        .parse(action?.details?.variant);
      if (
        offer.seller_id !== change.created_by ||
        offer.variant_id !== variant.id ||
        offer.variant_sku !== variant.sku
      )
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "Invalid initial variant offer owner.",
        );
      await requireInitialVariantOfferResources(
        container,
        offer.seller_id,
        offer.shipping_profile_id,
      );
    }
    const attributes = offer
      ? (change.actions ?? []).flatMap((action) =>
          action?.action === ProductChangeActionType.ATTRIBUTE_UPDATE &&
          !action.applied
            ? [
                {
                  id: action.id,
                  update: attributeUpdateSchema.parse(
                    action.details?.update,
                  ) satisfies ProductAttributeBatchUpdate,
                },
              ]
            : [],
        )
      : [];
    if (attributes.length > 3)
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Use at most three variant options.",
      );
    const imageActions = (change.actions ?? []).filter(
      (action) =>
        action?.action === ProductChangeActionType.UPDATE &&
        action.details?.field === "images",
    );
    const additionsIds = new Set(
      (change.actions ?? []).flatMap((action) => {
        if (action?.action !== ProductChangeActionType.VARIANT_UPDATE)
          return [];
        const parsed = z
          .object({
            fields: z.object({
              images: z.object({ add: z.array(z.string()) }),
            }),
          })
          .safeParse(action.details);
        return parsed.success ? parsed.data.fields.images.add : [];
      }),
    );
    const imageUpdate = imageActions.length > 0 && additionsIds.size > 0;
    const { data: gallery } = imageUpdate
      ? await container.resolve(ContainerRegistrationKeys.QUERY).graph(
          {
            entity: "product",
            fields: ["id", "thumbnail", "images.id", "images.url"],
            filters: { id: change.product_id! },
          },
          { cache: { enable: false } },
        )
      : { data: [] };
    const gallerySnapshot = gallery[0]
      ? {
          id: gallery[0].id,
          thumbnail: gallery[0].thumbnail,
          images: (gallery[0].images ?? []).flatMap((image) =>
            image ? [{ id: image.id, url: image.url }] : [],
          ),
        }
      : undefined;
    const { data: axes } = attributes.length
      ? await container.resolve(ContainerRegistrationKeys.QUERY).graph(
          {
            entity: "product_attribute",
            fields: ["id", "product_id", "values.id"],
            filters: { id: attributes.map((action) => action.update.id) },
          },
          { cache: { enable: false } },
        )
      : { data: [] };
    const { data: products } = attributes.length
      ? await container.resolve(ContainerRegistrationKeys.QUERY).graph(
          {
            entity: "product",
            fields: ["product_attribute_values.id"],
            filters: { id: change.product_id! },
          },
          { cache: { enable: false } },
        )
      : { data: [] };
    const mediaActionUpdates = imageUpdate
      ? imageActions.flatMap((action) => {
          if (!action) return [];
          const proposed = z
            .array(z.object({ id: z.string(), url: z.string() }))
            .parse(action.details?.value);
          const previous = z
            .array(z.object({ id: z.string(), url: z.string() }))
            .parse(action.details?.previous_value);
          const previousIds = new Set(previous.map((image) => image.id));
          const current = gallerySnapshot?.images ?? [];
          const ids = new Set(current.map((image) => image.id));
          const newRows = proposed.filter(
            (image) =>
              additionsIds.has(image.id) &&
              !previousIds.has(image.id) &&
              !ids.has(image.id),
          );
          const newIds = new Set(newRows.map((image) => image.id));
          if ([...additionsIds].some((id) => !ids.has(id) && !newIds.has(id)))
            throw new MedusaError(
              MedusaError.Types.INVALID_DATA,
              "Una imagen seleccionada ya no pertenece al producto. Revisa la solicitud.",
            );
          return [
            {
              id: action.id,
              details: { ...action.details, value: [...current, ...newRows] },
            },
          ];
        })
      : [];
    const snapshot =
      offer || imageUpdate
        ? {
            product_id: change.product_id!,
            gallery: gallerySnapshot,
            axes: axes.map((axis) => ({
              id: axis.id,
              own: Boolean(axis.product_id),
              value_ids: (axis.values ?? []).flatMap((value) =>
                value ? [value.id] : [],
              ),
            })),
            selected: (products[0]?.product_attribute_values ?? []).flatMap(
              (value) => (value ? [value.id] : []),
            ),
          }
        : undefined;
    return new StepResponse(
      {
        product_id: change.product_id!,
        attributes,
        offer,
        mediaActionUpdates,
      },
      snapshot ?? null,
    );
  },
  async (snapshot, { container }) => {
    // Native compensation can retain an initially empty gallery and newly added
    // axis values. Restore those collections if the commercial setup fails.
    if (!snapshot) return;
    const { data: products } = await container
      .resolve(ContainerRegistrationKeys.QUERY)
      .graph(
        {
          entity: "product",
          fields: ["product_attribute_values.id"],
          filters: { id: snapshot.product_id },
        },
        { cache: { enable: false } },
      );
    const selected = (products[0]?.product_attribute_values ?? []).flatMap(
      (value) => (value ? [value.id] : []),
    );
    for (const axis of snapshot.axes) {
      const { data: current } = await container
        .resolve(ContainerRegistrationKeys.QUERY)
        .graph(
          {
            entity: "product_attribute",
            fields: ["values.id"],
            filters: { id: axis.id },
          },
          { cache: { enable: false } },
        );
      const previous = axis.own ? axis.value_ids : snapshot.selected;
      const remove = (current[0]?.values ?? []).flatMap((value) =>
        value &&
        !previous.includes(value.id) &&
        (axis.own || selected.includes(value.id))
          ? [value.id]
          : [],
      );
      if (remove.length)
        await applyProductAttributeChangeActionsWorkflow(container).run({
          input: {
            product_id: snapshot.product_id,
            add: [],
            remove: [],
            update: [{ id: axis.id, remove }],
          },
        });
    }
    if (snapshot.gallery)
      await updateProductsWorkflow(container).run({
        input: { products: [snapshot.gallery] },
      });
  },
);

const applyCompleteVariantAxisWorkflow = createWorkflow(
  "apply-complete-variant-axis",
  function (input: {
    product_id: string;
    update: ProductAttributeBatchUpdate;
  }) {
    applyProductAttributeChangeActionsWorkflow.runAsStep({
      input: transform(input, (input) => ({
        product_id: input.product_id,
        add: [],
        remove: [],
        update: [input.update],
      })),
    });
    return new WorkflowResponse({ product_id: input.product_id });
  },
);

type PreparedConfirmation = Pick<
  ReturnType<typeof prepareCompleteCatalogConfirmationStep>,
  "product_id" | "attributes" | "offer" | "mediaActionUpdates"
>;

const applyCompleteCatalogConfirmationWorkflow = createWorkflow(
  "apply-complete-catalog-confirmation",
  function (context: { input: Input; prepared: PreparedConfirmation }) {
    const input = context.input;
    const prepared = context.prepared;
    const gallery = prepareProductGalleryChangeStep(
      transform(input, (input) => ({ change_id: input.id })),
    );
    when({ gallery }, ({ gallery }) => gallery.action_updates.length > 0).then(
      () =>
        updateProductChangeActionsStep(gallery.action_updates).config({
          name: "apply-product-gallery-plan",
        }),
    );
    unlinkProductGalleryVariantsStep(gallery.removals);
    when(
      { gallery },
      ({ gallery }) => gallery.thumbnail_update.length > 0,
    ).then(() =>
      updateProductsWorkflow
        .runAsStep({ input: { products: gallery.thumbnail_update } })
        .config({ name: "update-product-gallery-thumbnail" }),
    );
    when(
      { prepared },
      ({ prepared }) => prepared.mediaActionUpdates.length > 0,
    ).then(() =>
      updateProductChangeActionsStep(prepared.mediaActionUpdates).config({
        name: "merge-current-variant-gallery",
      }),
    );
    // Mercur applies attribute changes after creating variants. New option values
    // must be applied first, one axis at a time, within this compensated workflow.
    const firstAxis = when(
      { prepared },
      ({ prepared }) => prepared.attributes.length > 0,
    ).then(() =>
      applyCompleteVariantAxisWorkflow
        .runAsStep({
          input: transform(prepared, (prepared) => ({
            product_id: prepared.product_id,
            update: prepared.attributes[0].update,
          })),
        })
        .config({ name: "apply-complete-variant-first-axis" }),
    );
    const secondAxis = when(
      { prepared },
      ({ prepared }) => prepared.attributes.length > 1,
    ).then(() =>
      applyCompleteVariantAxisWorkflow
        .runAsStep({
          input: transform(
            { prepared, firstAxis },
            ({ prepared, firstAxis }) => ({
              product_id: firstAxis!.product_id,
              update: prepared.attributes[1].update,
            }),
          ),
        })
        .config({ name: "apply-complete-variant-second-axis" }),
    );
    const thirdAxis = when(
      { prepared },
      ({ prepared }) => prepared.attributes.length > 2,
    ).then(() =>
      applyCompleteVariantAxisWorkflow
        .runAsStep({
          input: transform(
            { prepared, secondAxis },
            ({ prepared, secondAxis }) => ({
              product_id: secondAxis!.product_id,
              update: prepared.attributes[2].update,
            }),
          ),
        })
        .config({ name: "apply-complete-variant-third-axis" }),
    );
    when({ prepared }, ({ prepared }) => prepared.attributes.length > 0).then(
      () =>
        updateProductChangeActionsStep(
          transform(
            { prepared, firstAxis, secondAxis, thirdAxis },
            ({ prepared }) =>
              prepared.attributes.map((action) => ({
                id: action.id,
                applied: true,
              })),
          ),
        ),
    );
    const initial = prepareInitialProductExtrasStep(
      transform(prepared, (prepared) => ({
        seller_id: prepared.offer?.seller_id ?? "",
        member_id: prepared.offer?.member_id ?? "",
        variants: prepared.offer
          ? [{ id: prepared.offer.variant_id, sku: prepared.offer.variant_sku }]
          : [],
        images: [],
        extras: prepared.offer
          ? {
              initial_offers: [
                {
                  variant_sku: prepared.offer.variant_sku,
                  amount: prepared.offer.amount,
                  stocked_quantity: prepared.offer.stocked_quantity,
                  shipping_profile_id: prepared.offer.shipping_profile_id,
                },
              ],
            }
          : {},
      })),
    );
    confirmProductChangeWorkflow.runAsStep({
      input: transform(input, (input) => ({
        ids: [input.id],
        confirmed_by: input.confirmed_by,
        internal_note: input.internal_note,
        additional_data: input.additional_data,
      })),
    });
    when({ initial }, ({ initial }) => initial.offers.length > 0).then(() =>
      createOffersWorkflow.runAsStep({ input: { offers: initial.offers } }),
    );
    return new WorkflowResponse({ id: input.id });
  },
);

export const confirmCompleteCatalogProductChangeWorkflow = createWorkflow(
  "confirm-complete-catalog-product-change",
  function (input: Input) {
    const prepared = prepareCompleteCatalogConfirmationStep(input);
    // Complete native cancellation before restoring collections; skipped
    // conditional steps must not let restoration race with their rollback.
    applyCompleteCatalogConfirmationWorkflow.runAsStep({
      input: { input, prepared },
    });
    return new WorkflowResponse({ id: input.id });
  },
);
