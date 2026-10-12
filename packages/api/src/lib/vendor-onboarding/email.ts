import { configManager } from "@medusajs/framework/config";
import { Modules } from "@medusajs/framework/utils";
import { getAuthEmailConfiguration } from "../auth-email";

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
export function onboardingEmailConfiguration() {
  const auth = getAuthEmailConfiguration();
  if (!auth.enabled) return null;
  const module = record(configManager.config.modules?.[Modules.NOTIFICATION]);
  const providers = record(module.options).providers;
  if (!Array.isArray(providers) || !providers.some(provider => {
    const item = record(provider);
    const channels = record(item.options).channels;
    return typeof item.resolve === "string" && !/(local|console|mock)/i.test(item.resolve) && Array.isArray(channels) && channels.includes("email");
  })) return null;
  return auth;
}
