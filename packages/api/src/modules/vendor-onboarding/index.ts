import { Module } from "@medusajs/framework/utils";
import VendorOnboardingService from "./service";
export const VENDOR_ONBOARDING_MODULE = "vendorOnboarding";
export default Module(VENDOR_ONBOARDING_MODULE, { service: VendorOnboardingService });
