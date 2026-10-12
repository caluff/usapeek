import type { SellerDTO } from "@mercurjs/types";
import type { CatalogPermissionListResponse } from "@usapeek/api/catalog-permission-contracts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CatalogPermissionForm } from "./catalog-permission-form";
import { CatalogPermissionSettings } from "./catalog-permission-settings";
import { catalogReviewMode } from "./helpers";

export type CatalogPermissionRead =
  Promise<CatalogPermissionListResponse | null>;

export async function CatalogPermissionRegion({
  seller,
  permissions,
  href,
  settings = false,
}: {
  seller: Pick<SellerDTO, "id" | "name">;
  permissions: CatalogPermissionRead;
  href: string;
  settings?: boolean;
}) {
  const result = await permissions;
  const matches =
    result && Array.isArray(result.catalog_permissions)
      ? result.catalog_permissions.filter(
          (permission) => permission?.seller_id === seller.id,
        )
      : null;
  const mode =
    matches && matches.length <= 1 ? catalogReviewMode(matches[0]) : null;
  if (!mode)
    return (
      <div role="alert" className="space-y-2">
        <p className="text-sm text-destructive">Permiso no disponible.</p>
        <Button asChild variant="outline" size="sm">
          <a href={href}>Actualizar estado</a>
        </Button>
      </div>
    );
  return settings ? (
    <CatalogPermissionSettings
      sellerId={seller.id}
      sellerName={seller.name}
      mode={mode}
    />
  ) : (
    <CatalogPermissionForm
      key={seller.id}
      sellerId={seller.id}
      sellerName={seller.name}
      mode={mode}
    />
  );
}

export function CatalogPermissionSkeleton({
  settings = false,
}: {
  settings?: boolean;
}) {
  return (
    <Skeleton
      aria-label="Cargando permiso de catálogo"
      className={settings ? "h-16 w-full" : "h-9 w-full min-w-48"}
    />
  );
}
