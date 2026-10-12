import { Module } from "@medusajs/framework/utils";
import CatalogMediaService from "./service";

export const CATALOG_MEDIA_MODULE = "catalogMedia";
export default Module(CATALOG_MEDIA_MODULE, { service: CatalogMediaService });
