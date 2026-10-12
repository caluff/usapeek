import { MedusaService } from "@medusajs/framework/utils";
import { SellerCatalogPermission } from "./models/seller-catalog-permission";

export default class CatalogPermissionService extends MedusaService({
  SellerCatalogPermission,
}) {}
