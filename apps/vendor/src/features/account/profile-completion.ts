import { safeRedirectPath } from "../../lib/auth-utils";

export type ProfileSearchParams = {
  profile?: string | string[];
  next?: string | string[];
};

export function profileReturnPath(next: unknown) {
  const destination = safeRedirectPath(
    typeof next === "string" ? next : null,
    "/seller",
  );
  const pathname = destination.split(/[?#]/, 1)[0];
  return pathname === "/seller/account" ||
    pathname.startsWith("/seller/account/")
    ? "/seller"
    : destination;
}

export function profileLoginDestination(
  firstName: string | null | undefined,
  next: string,
) {
  const destination = safeRedirectPath(next, "/seller");
  return firstName?.trim()
    ? destination
    : `/seller/account?profile=complete&next=${encodeURIComponent(profileReturnPath(destination))}`;
}
