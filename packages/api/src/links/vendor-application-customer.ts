import { defineLink } from "@medusajs/framework/utils";
import CustomerModule from "@medusajs/medusa/customer";
import VendorOnboarding from "../modules/vendor-onboarding";
export default defineLink({ linkable: VendorOnboarding.linkable.vendorApplication, field: "customer_id" }, CustomerModule.linkable.customer, { readOnly: true });
