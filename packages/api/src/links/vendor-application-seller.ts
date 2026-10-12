import { defineLink } from "@medusajs/framework/utils";
import SellerModule from "@mercurjs/core/modules/seller";
import VendorOnboarding from "../modules/vendor-onboarding";
export default defineLink({ linkable: VendorOnboarding.linkable.vendorApplication, field: "seller_id" }, SellerModule.linkable.seller, { readOnly: true });
