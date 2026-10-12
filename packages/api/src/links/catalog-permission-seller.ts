import { defineLink } from "@medusajs/framework/utils";
import SellerModule from "@mercurjs/core/modules/seller";
import CatalogPermission from "../modules/catalog-permission";

export default defineLink(
  {
    linkable: CatalogPermission.linkable.sellerCatalogPermission,
    field: "seller_id",
  },
  SellerModule.linkable.seller,
  { readOnly: true },
);
