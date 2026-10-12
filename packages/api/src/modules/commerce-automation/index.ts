import { Module } from "@medusajs/framework/utils";
import CommerceAutomationService from "./service";
export const COMMERCE_AUTOMATION_MODULE = "commerceAutomation";
export default Module(COMMERCE_AUTOMATION_MODULE, {
  service: CommerceAutomationService,
});
