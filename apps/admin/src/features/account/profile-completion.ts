import { safeRedirectPath } from "../../lib/auth-utils";

export type ProfileSearchParams = {
  profile?: string | string[];
  next?: string | string[];
};

export function profileReturnPath(next: unknown) {
  const destination = safeRedirectPath(
    typeof next === "string" ? next : null,
    "/dashboard",
  );
  const pathname = destination.split(/[?#]/, 1)[0];
  return pathname === "/dashboard/settings" ||
    pathname.startsWith("/dashboard/settings/")
    ? "/dashboard"
    : destination;
}

export function profileLoginDestination(
  firstName: string | null | undefined,
  next: string,
) {
  const destination = safeRedirectPath(next, "/dashboard");
  return firstName?.trim()
    ? destination
    : `/dashboard/settings?profile=complete&next=${encodeURIComponent(profileReturnPath(destination))}`;
}
