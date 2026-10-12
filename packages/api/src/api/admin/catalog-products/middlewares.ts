import {
  validateAndTransformBody,
  type MiddlewareRoute,
} from "@medusajs/framework/http";
import { PolicyOperation } from "@medusajs/framework/utils";
import { AdminCatalogProductManageSchema } from "../../../lib/catalog-management/contracts";

export const adminCatalogManagementMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/catalog-products/:id/manage",
    method: "POST",
    bodyParser: { sizeLimit: "128kb" },
    middlewares: [validateAndTransformBody(AdminCatalogProductManageSchema)],
    policies: [{ resource: "product", operation: PolicyOperation.update }],
  },
];
