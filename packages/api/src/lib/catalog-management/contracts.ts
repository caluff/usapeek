import { z } from "@medusajs/framework/zod";

const expectedUpdatedAt = z.iso.datetime({ offset: true });
const content = z.strictObject({
  title: z.string().trim().min(1).max(200),
  subtitle: z.string().trim().max(200).nullable(),
  description: z.string().trim().max(20_000).nullable(),
});

export const AdminCatalogProductManageSchema = z.discriminatedUnion("action", [
  z.strictObject({
    expected_updated_at: expectedUpdatedAt,
    action: z.literal("update-content"),
    content,
  }),
  z.strictObject({
    expected_updated_at: expectedUpdatedAt,
    action: z.literal("withdraw"),
  }),
  z.strictObject({
    expected_updated_at: expectedUpdatedAt,
    action: z.literal("publish"),
  }),
]);

export const AdminCatalogManagementConflictCodeSchema = z.enum([
  "catalog_pending_change",
  "catalog_product_changed",
  "catalog_status_changed",
]);

export type AdminCatalogProductManageInput = z.infer<
  typeof AdminCatalogProductManageSchema
>;
export type AdminCatalogManagementConflictCode = z.infer<
  typeof AdminCatalogManagementConflictCodeSchema
>;

export const ProductLifecycleOperationSchema = z.enum([
  "archive",
  "deactivate",
  "activate",
]);
export const ProductLifecycleStateSchema = z.strictObject({
  can_manage: z.boolean(),
  can_activate: z.boolean(),
  status: z.string(),
  requires_review: z.boolean(),
  reason: z.string().nullable(),
});
export const ProductLifecycleResultSchema = z.strictObject({
  operation: ProductLifecycleOperationSchema,
  applied: z.boolean(),
  product_change_id: z.string(),
});
export type ProductLifecycleOperation = z.infer<
  typeof ProductLifecycleOperationSchema
>;
export type ProductLifecycleState = z.infer<typeof ProductLifecycleStateSchema>;
export type ProductLifecycleResult = z.infer<
  typeof ProductLifecycleResultSchema
>;
