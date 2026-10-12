import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import {
  AdminCatalogManagementConflictCodeSchema,
  type AdminCatalogProductManageInput,
} from "../../../../../lib/catalog-management/contracts";
import { manageAdminCatalogProductWorkflow } from "../../../../../workflows/manage-admin-catalog-product";

export async function POST(
  req: AuthenticatedMedusaRequest<AdminCatalogProductManageInput>,
  res: MedusaResponse,
) {
  try {
    const { result } = await manageAdminCatalogProductWorkflow(req.scope).run({
      input: { product_id: req.params.id, body: req.validatedBody },
    });
    res.json(result);
  } catch (error) {
    if (MedusaError.isMedusaError(error)) {
      const code = AdminCatalogManagementConflictCodeSchema.safeParse(
        error.code,
      );
      if (error.type === MedusaError.Types.CONFLICT && code.success) {
        // The native SDK retains only HTTP status and message on FetchError.
        res
          .status(409)
          .json({ type: error.type, code: code.data, message: code.data });
        return;
      }
    }
    throw error;
  }
}
