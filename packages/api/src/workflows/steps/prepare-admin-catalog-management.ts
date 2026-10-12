import type {
  MedusaContainer,
  UpdateProductDTO,
} from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { ProductChangeStatus, ProductStatus } from "@mercurjs/types";
import { isValid } from "date-fns/isValid";
import { parseISO } from "date-fns/parseISO";
import {
  AdminCatalogProductManageSchema,
  type AdminCatalogProductManageInput,
  type AdminCatalogManagementConflictCode,
} from "../../lib/catalog-management/contracts";

export type AdminCatalogManagementWorkflowInput = {
  product_id: string;
  body: AdminCatalogProductManageInput;
};

function conflict(code: AdminCatalogManagementConflictCode): never {
  throw new MedusaError(MedusaError.Types.CONFLICT, code, code);
}

export async function prepareAdminCatalogManagement(
  container: MedusaContainer,
  input: AdminCatalogManagementWorkflowInput,
) {
  const body = AdminCatalogProductManageSchema.parse(input.body);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const [{ data: products }, { data: changes }] = await Promise.all([
    query.graph(
      {
        entity: "product",
        fields: ["id", "status", "updated_at"],
        filters: { id: input.product_id },
      },
      { cache: { enable: false } },
    ),
    query.graph(
      {
        entity: "product_change",
        fields: ["id"],
        filters: {
          product_id: input.product_id,
          status: ProductChangeStatus.PENDING,
        },
        pagination: { take: 1 },
      },
      { cache: { enable: false } },
    ),
  ]);
  const product = products[0];
  if (!product)
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Product not found.");
  if (changes.length) conflict("catalog_pending_change");
  const updatedAt =
    typeof product.updated_at === "string"
      ? parseISO(product.updated_at)
      : product.updated_at;
  if (
    !updatedAt ||
    !isValid(updatedAt) ||
    updatedAt.toISOString() !== parseISO(body.expected_updated_at).toISOString()
  )
    conflict("catalog_product_changed");

  let update: UpdateProductDTO;
  if (body.action === "update-content") {
    update = {
      title: body.content.title,
      subtitle: body.content.subtitle || null,
      description: body.content.description || null,
    };
  } else {
    const expectedStatus =
      body.action === "withdraw"
        ? ProductStatus.PUBLISHED
        : ProductStatus.DRAFT;
    if (product.status !== expectedStatus) conflict("catalog_status_changed");
    update = {
      status:
        body.action === "withdraw"
          ? ProductStatus.DRAFT
          : ProductStatus.PUBLISHED,
    };
  }
  return { selector: { id: input.product_id }, update };
}

export const prepareAdminCatalogManagementStep = createStep(
  "prepare-admin-catalog-management",
  async (input: AdminCatalogManagementWorkflowInput, { container }) =>
    new StepResponse(await prepareAdminCatalogManagement(container, input)),
);
