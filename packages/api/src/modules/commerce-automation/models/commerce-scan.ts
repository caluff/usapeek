import { model } from "@medusajs/framework/utils";

export const CommerceScan = model.define("commerce_scan", {
  id: model.text().primaryKey(),
  position: model.text().nullable(),
});
