import { model } from "@medusajs/framework/utils";

export const SellerCatalogPermission = model
  .define("seller_catalog_permission", {
    id: model.id({ prefix: "catperm" }).primaryKey(),
    seller_id: model.text(),
    mode: model.enum(["supervised", "authorized"]).default("supervised"),
    changed_by: model.text(),
  })
  .indexes([{ on: ["seller_id"], unique: true, where: "true" }]);
