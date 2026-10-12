import type { MedusaContainer } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  FeatureFlag,
  MedusaError,
} from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import { MercurFeatureFlags } from "@mercurjs/types";
import { readCatalogOptions } from "./product-options";
import { assertSellerCatalogImages } from "../catalog-media/access";

const text = z.string().trim().min(1).max(200);
const optionMap = z.record(text, text);
const physicalSpecifications = {
  material: text.nullish(),
  origin_country: z
    .string()
    .trim()
    .regex(/^[a-zA-Z]{2}$/, "Use a two-letter country code.")
    .nullish(),
  hs_code: z.string().trim().max(200).nullish(),
  mid_code: z.string().trim().max(200).nullish(),
  weight: z.number().finite().positive().nullish(),
  length: z.number().finite().positive().nullish(),
  width: z.number().finite().positive().nullish(),
  height: z.number().finite().positive().nullish(),
};
const physicalSpecificationsSchema = z.object(physicalSpecifications);
const variantSchema = z.object({
  id: z.string().optional(),
  title: text.optional(),
  sku: z.string().trim().max(100).nullish(),
  options: optionMap.optional(),
  ...physicalSpecifications,
});

export function validateCatalogVariantFields(body: unknown) {
  return parseCatalogInput(variantSchema, body);
}
const inlineAxis = z.object({
  title: text,
  type: z.literal("multi_select"),
  is_variant_axis: z.literal(true),
  values: z.array(text).min(1).max(30),
});
const invalid: (message: string) => never = (message) => {
  throw new MedusaError(MedusaError.Types.INVALID_DATA, message);
};
const record = (value: unknown): Record<string, unknown> =>
  z.record(z.string(), z.unknown()).parse(value);

function parseCatalogInput<T extends z.ZodType>(
  schema: T,
  value: unknown,
): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    invalid(
      parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; "),
    );
  return parsed.data;
}

async function readReferencedAttributes(
  container: MedusaContainer,
  attributes: Record<string, unknown>[],
) {
  const ids = [
    ...new Set(
      attributes
        .filter((attribute) => attribute.id !== undefined)
        .map((attribute) => text.parse(attribute.id)),
    ),
  ];
  const { data } = ids.length
    ? await container.resolve(ContainerRegistrationKeys.QUERY).graph(
        {
          entity: "product_attribute",
          fields: [
            "id",
            "name",
            "type",
            "is_active",
            "product_id",
            "is_variant_axis",
            "values.id",
            "values.name",
          ],
          filters: { id: ids },
        },
        { cache: { enable: false } },
      )
    : { data: [] };
  return new Map(data.map((attribute) => [attribute.id, attribute]));
}

export function validateCombinations(
  axes: { title: string; values: string[] }[],
  variants: { options?: Record<string, string> }[],
) {
  if (axes.length > 3 || variants.length > 100)
    invalid("Use at most three options and 100 variants.");
  if (
    new Set(axes.map((axis) => axis.title.toLowerCase())).size !== axes.length
  )
    invalid("Duplicate option title.");
  for (const axis of axes)
    if (
      !axis.values.length ||
      new Set(axis.values.map((value) => value.toLowerCase())).size !==
        axis.values.length
    )
      invalid("Duplicate or empty option values.");
  const combinations = new Set<string>();
  for (const variant of variants) {
    const options = variant.options ?? {};
    if (
      Object.keys(options).length !== axes.length ||
      axes.some((axis) => !axis.values.includes(options[axis.title]))
    )
      invalid("Every variant must select one existing value per option.");
    const key = JSON.stringify(axes.map((axis) => options[axis.title]));
    if (combinations.has(key)) invalid("Duplicate variant combination.");
    combinations.add(key);
  }
}

export async function validateCatalogMutation(
  container: MedusaContainer,
  input: {
    seller_id: string;
    body: unknown;
    product_id?: string;
    variant_id?: string;
    mode: "create" | "update" | "variant" | "attributes";
  },
) {
  if (!FeatureFlag.isFeatureEnabled(MercurFeatureFlags.PRODUCT_REQUEST))
    invalid("Product moderation must be enabled before vendor catalog writes.");
  const body = record(input.body ?? {});
  if (input.mode === "create" || input.mode === "update")
    parseCatalogInput(physicalSpecificationsSchema, body);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  if (!input.seller_id) invalid("Seller context is required.");
  if (input.mode === "variant" && body.images !== undefined) {
    const imageLinks = z
      .object({
        add: z.array(text).optional(),
        remove: z.array(text).optional(),
      })
      .parse(body.images);
    const { data: products } = await query.graph(
      {
        entity: "product",
        fields: ["images.id"],
        filters: { id: input.product_id },
      },
      { cache: { enable: false } },
    );
    const available = new Set(
      (products[0]?.images ?? []).map((image) => image?.id),
    );
    if (
      [...(imageLinks.add ?? []), ...(imageLinks.remove ?? [])].some(
        (id) => !available.has(id),
      )
    )
      invalid("Variant image does not belong to this product.");
  }
  await assertSellerCatalogImages(container, input.seller_id, {
    ...body,
    ...(input.mode === "variant" ? { images: undefined } : {}),
    product_id: input.mode === "create" ? undefined : input.product_id,
    variant_context: input.mode === "variant",
    variant_id: input.mode === "variant" ? input.variant_id : undefined,
  });
  if (input.mode === "create" && body.status !== "proposed")
    invalid("Vendor products must be proposed for approval.");
  if (body.categories !== undefined) {
    const ids = z
      .array(z.object({ id: text }))
      .max(20)
      .parse(body.categories)
      .map((row) => row.id);
    if (new Set(ids).size !== ids.length) invalid("Duplicate categories.");
    if (ids.length) {
      const { data } = await query.graph(
        {
          entity: "product_category",
          fields: ["id"],
          filters: { id: ids, is_active: true, is_internal: false },
        },
        { cache: { enable: false } },
      );
      if (data.length !== ids.length)
        invalid("A selected category is unavailable.");
    }
  }
  if (input.mode === "update") {
    if (body.options !== undefined || body.variants !== undefined)
      invalid(
        "Use moderated attribute and variant endpoints to change product options or variants.",
      );
    return;
  }
  if (input.mode === "create") {
    if (body.options !== undefined)
      invalid("Define product options through variant-axis attributes.");
    const attrs = z
      .array(z.record(z.string(), z.unknown()))
      .max(30)
      .parse(body.attributes ?? []);
    const axes: { title: string; values: string[] }[] = [];
    const referenced = await readReferencedAttributes(container, attrs);
    for (const attribute of attrs) {
      if (attribute.id !== undefined) {
        const found = referenced.get(text.parse(attribute.id));
        if (!found?.is_active || found.product_id)
          invalid("Attribute is unavailable.");
        const valueIds = z.array(text).parse(attribute.value_ids ?? []);
        if (
          valueIds.some(
            (id) => !found.values?.some((value) => value?.id === id),
          )
        )
          invalid("Attribute value belongs to another attribute.");
        if (found.is_variant_axis)
          axes.push({
            title: found.name,
            values: valueIds.map(
              (id) => found.values!.find((value) => value?.id === id)!.name,
            ),
          });
      } else if (attribute.is_variant_axis) {
        axes.push(inlineAxis.parse(attribute));
      }
    }
    const variants = parseCatalogInput(
      z
        .array(variantSchema.extend({ title: text, sku: text.max(100) }))
        .min(1)
        .max(100),
      body.variants,
    );
    if (
      new Set(variants.map((variant) => variant.sku)).size !== variants.length
    )
      invalid("Duplicate master SKU.");
    validateCombinations(axes, variants);
    return;
  }
  const { data: products } = await query.graph(
    {
      entity: "product",
      fields: [
        "id",
        "product_attribute_values.id",
        "product_attribute_values.attribute.id",
      ],
      filters: { id: input.product_id },
    },
    { cache: { enable: false } },
  );
  const product = products[0];
  if (!product) invalid("Product is unavailable.");
  const { options: currentOptions, variants: currentVariants } =
    await readCatalogOptions(container, input.product_id!);
  if (input.mode === "variant") {
    if (
      input.variant_id &&
      !currentVariants.some((variant) => variant.id === input.variant_id)
    )
      invalid("Variant does not belong to this product.");
    const variant = parseCatalogInput(variantSchema, body);
    if (
      variant.sku &&
      currentVariants.some(
        (current) =>
          current.id !== input.variant_id && current.sku === variant.sku,
      )
    )
      invalid("Duplicate master SKU.");
    if (body.manage_inventory === true)
      invalid("Master variants do not own seller inventory.");
    if (variant.options || !input.variant_id) {
      const axes = currentOptions.map((option) => ({
        title: option.title,
        values: (option.values ?? []).map((value) => value.value),
      }));
      const existing = currentVariants
        .filter((row) => row.id !== input.variant_id)
        .map((row) => ({
          options: Object.fromEntries(
            (row.options ?? []).map((value) => [
              value.option?.title ?? "",
              value.value,
            ]),
          ),
        }));
      validateCombinations(axes, [...existing, variant]);
    }
    return;
  }
  const linked = product.product_attribute_values ?? [];
  for (const id of z.array(text).parse(body.remove ?? []))
    if (!linked.some((value) => value?.attribute?.id === id))
      invalid("Attribute is not attached to this product.");
  for (const update of z
    .array(z.record(z.string(), z.unknown()))
    .parse(body.update ?? [])) {
    const id = text.parse(update.id);
    if (!linked.some((value) => value?.attribute?.id === id))
      invalid("Attribute is not attached to this product.");
    for (const valueId of z.array(text).parse(update.remove ?? []))
      if (
        !linked.some(
          (value) => value?.id === valueId && value?.attribute?.id === id,
        )
      )
        invalid("Attribute value is not selected on this product.");
  }
  const additions = z
    .array(z.record(z.string(), z.unknown()))
    .parse(body.add ?? []);
  const referenced = await readReferencedAttributes(container, additions);
  for (const add of additions) {
    if (add.id !== undefined) {
      const found = referenced.get(text.parse(add.id));
      if (
        !found?.is_active ||
        (found.product_id && found.product_id !== input.product_id) ||
        z
          .array(text)
          .parse(add.value_ids ?? [])
          .some((id) => !found.values?.some((value) => value?.id === id))
      )
        invalid("Attribute or value is unavailable.");
    } else if (add.is_variant_axis) {
      const axis = inlineAxis.parse(add);
      if (
        currentOptions.some(
          (option) => option.title.toLowerCase() === axis.title.toLowerCase(),
        )
      )
        invalid("Option already exists.");
      validateCombinations([axis], []);
    }
  }
}
