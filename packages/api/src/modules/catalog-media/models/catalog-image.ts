import { model } from "@medusajs/framework/utils";

export const CatalogImage = model.define("catalog_image", {
  id: model.id({ prefix: "catimg" }).primaryKey(),
  seller_id: model.text(), member_id: model.text(),
  file_id: model.text(), url: model.text(),
}).indexes([
  { on: ["file_id"], unique: true, where: "true" },
  { on: ["url"], unique: true, where: "true" },
  { on: ["seller_id", "url"] },
]);
