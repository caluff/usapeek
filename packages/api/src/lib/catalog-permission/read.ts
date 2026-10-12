import { randomUUID } from "node:crypto";
import type { MedusaContainer } from "@medusajs/framework/types";
import { CATALOG_PERMISSION_MODULE } from "../../modules/catalog-permission";
import type CatalogPermissionService from "../../modules/catalog-permission/service";
import type { CatalogPermissionDTO } from "./contracts";

export async function readCatalogPermissions(
  container: MedusaContainer,
  sellerIds: string[],
): Promise<CatalogPermissionDTO[]> {
  const ids = [...new Set(sellerIds)];
  const service = container.resolve<CatalogPermissionService>(
    CATALOG_PERMISSION_MODULE,
  );
  const records = ids.length
    ? await service.listSellerCatalogPermissions(
        { seller_id: ids },
        { take: ids.length },
      )
    : [];
  const modes = new Map(
    records.map((record) => [record.seller_id, record.mode]),
  );
  return ids.map((seller_id) => ({
    seller_id,
    mode: modes.get(seller_id) ?? "supervised",
  }));
}

export async function readCatalogPermission(
  container: MedusaContainer,
  sellerId: string,
): Promise<CatalogPermissionDTO> {
  return (await readCatalogPermissions(container, [sellerId]))[0]!;
}

export function catalogPermissionLock(sellerId: string) {
  return {
    key: `seller-catalog-permission:${sellerId}`,
    ownerId: randomUUID(),
    timeout: 30,
    ttl: 120,
  };
}
