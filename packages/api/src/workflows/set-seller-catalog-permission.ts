import { acquireLockStep, releaseLockStep } from "@medusajs/core-flows";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import type { CatalogPermissionMode } from "../lib/catalog-permission/contracts";
import { catalogPermissionLock } from "../lib/catalog-permission/read";
import { requireReviewer } from "../lib/vendor-onboarding/access";
import { CATALOG_PERMISSION_MODULE } from "../modules/catalog-permission";
import type CatalogPermissionService from "../modules/catalog-permission/service";

type Input = {
  seller_id: string;
  actor_id: string;
  mode: CatalogPermissionMode;
};

const setSellerCatalogPermissionStep = createStep(
  "set-seller-catalog-permission",
  async (input: Input, { container }) => {
    await requireReviewer(container, input.actor_id, "update");
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const { data: sellers } = await query.graph(
      { entity: "seller", fields: ["id"], filters: { id: input.seller_id } },
      { cache: { enable: false } },
    );
    if (!sellers.length)
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "La tienda no existe.",
      );
    const service = container.resolve<CatalogPermissionService>(
      CATALOG_PERMISSION_MODULE,
    );
    const [previous] = await service.listSellerCatalogPermissions({
      seller_id: input.seller_id,
    });
    const saved = previous
      ? await service.updateSellerCatalogPermissions({
          id: previous.id,
          mode: input.mode,
          changed_by: input.actor_id,
        })
      : await service.createSellerCatalogPermissions({
          id: input.seller_id,
          seller_id: input.seller_id,
          mode: input.mode,
          changed_by: input.actor_id,
        });
    return new StepResponse(
      { seller_id: saved.seller_id, mode: saved.mode },
      { id: saved.id, previous },
    );
  },
  async (state, { container }) => {
    if (!state) return;
    const service = container.resolve<CatalogPermissionService>(
      CATALOG_PERMISSION_MODULE,
    );
    if (state.previous) {
      await service.updateSellerCatalogPermissions({
        id: state.id,
        mode: state.previous.mode,
        changed_by: state.previous.changed_by,
      });
    } else {
      await service.deleteSellerCatalogPermissions(state.id);
    }
  },
);

export const setSellerCatalogPermissionWorkflow = createWorkflow(
  "set-seller-catalog-permission",
  function (input: Input) {
    const lock = transform(input, ({ seller_id }) =>
      catalogPermissionLock(seller_id),
    );
    acquireLockStep(lock);
    const permission = setSellerCatalogPermissionStep(input);
    releaseLockStep(lock);
    return new WorkflowResponse(permission);
  },
);
