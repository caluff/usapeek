import { Module } from "@medusajs/framework/utils";
import SpamProtectionService from "./service";

export const SPAM_PROTECTION_MODULE = "spamProtection";
export default Module(SPAM_PROTECTION_MODULE, {
  service: SpamProtectionService,
});
