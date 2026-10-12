import {
  authenticate,
  validateAndTransformBody,
  validateAndTransformQuery,
  type MiddlewareRoute,
} from "@medusajs/framework/http";
import { PolicyOperation } from "@medusajs/framework/utils";
import {
  CatalogPermissionListQuerySchema,
  UpdateCatalogPermissionSchema,
} from "../lib/catalog-permission/contracts";

export const catalogPermissionMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/catalog-permissions",
    method: "GET",
    middlewares: [
      authenticate("user", ["session", "bearer"]),
      validateAndTransformQuery(CatalogPermissionListQuerySchema, {}),
    ],
    policies: [{ resource: "seller", operation: PolicyOperation.read }],
  },
  {
    matcher: "/admin/sellers/:id/catalog-permission",
    method: "POST",
    bodyParser: { sizeLimit: "4kb" },
    middlewares: [
      authenticate("user", ["session", "bearer"]),
      validateAndTransformBody(UpdateCatalogPermissionSchema),
    ],
    policies: [{ resource: "seller", operation: PolicyOperation.update }],
  },
  {
    matcher: "/vendor/catalog-permission",
    method: "GET",
    policies: [{ resource: "product", operation: PolicyOperation.read }],
    middlewares: [],
  },
];
