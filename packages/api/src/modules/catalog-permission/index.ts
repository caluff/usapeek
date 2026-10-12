import { Module } from "@medusajs/framework/utils";
import CatalogPermissionService from "./service";

export const CATALOG_PERMISSION_MODULE = "catalogPermission";
export default Module(CATALOG_PERMISSION_MODULE, {
  service: CatalogPermissionService,
});
