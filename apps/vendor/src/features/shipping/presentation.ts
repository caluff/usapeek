import type { ShippingProfileDTO } from "@medusajs/types";

export function isShippingProfileArchived(
  profile: Pick<ShippingProfileDTO, "metadata">,
) {
  return profile.metadata?.marketplace_v2_archived === true;
}

export function shippingProfileName(
  profile: Pick<ShippingProfileDTO, "name" | "metadata">,
) {
  const displayName = profile.metadata?.marketplace_v2_display_name;
  return typeof displayName === "string" && displayName.trim()
    ? displayName
    : profile.name;
}
