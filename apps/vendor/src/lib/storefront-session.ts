import { sellerApplicationUrl } from "./storefront-url";

export const STOREFRONT_SESSION_COOKIE = "mv2_vendor_storefront_handoff";

export function trustedStorefrontOrigin(origin: string | null, configuredUrl?: string, production = process.env.NODE_ENV === "production") {
  const application = sellerApplicationUrl(configuredUrl, production);
  return Boolean(origin && application && origin === new URL(application).origin);
}

export function storefrontSessionCode(body: string) {
  if (body.length > 256) return null;
  const params = new URLSearchParams(body);
  const code = params.get("code");
  return params.size === 1 && code && /^[a-f0-9]{64}$/.test(code) ? code : null;
}
