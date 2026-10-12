import { z } from "@medusajs/framework/zod";

export const CatalogPermissionModeSchema = z.enum(["supervised", "authorized"]);
export const CatalogPermissionSchema = z.object({
  seller_id: z.string().min(1),
  mode: CatalogPermissionModeSchema,
});
export const UpdateCatalogPermissionSchema = z.strictObject({
  mode: CatalogPermissionModeSchema,
});
export const CatalogPermissionListQuerySchema = z.object({
  seller_ids: z.array(z.string().min(1).max(128)).min(1).max(100),
});
export const CatalogPermissionResponseSchema = z.object({
  catalog_permission: CatalogPermissionSchema,
});
export const CatalogPermissionListResponseSchema = z.object({
  catalog_permissions: z.array(CatalogPermissionSchema),
});

export type CatalogPermissionMode = z.infer<typeof CatalogPermissionModeSchema>;
export type CatalogPermissionDTO = z.infer<typeof CatalogPermissionSchema>;
export type UpdateCatalogPermission = z.infer<
  typeof UpdateCatalogPermissionSchema
>;
export type CatalogPermissionListQuery = z.infer<
  typeof CatalogPermissionListQuerySchema
>;
export type CatalogPermissionResponse = z.infer<
  typeof CatalogPermissionResponseSchema
>;
export type CatalogPermissionListResponse = z.infer<
  typeof CatalogPermissionListResponseSchema
>;
