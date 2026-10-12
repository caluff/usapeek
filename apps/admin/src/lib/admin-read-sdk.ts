import { FetchError } from "@medusajs/js-sdk";
import { createAdminSdk, getAdminToken } from "./auth-sdk";

export async function requireAdminReadSdk() {
  const token = await getAdminToken();
  if (!token) throw new FetchError("Session expired", "Unauthorized", 401);
  const sdk = createAdminSdk(token);
  if (!sdk) throw new FetchError("Service unavailable", "Unavailable", 503);
  // Native API authentication and each endpoint's permissions remain authoritative.
  return sdk;
}

export function adminReadErrorResponse(error: unknown) {
  const status =
    error instanceof FetchError && [401, 403].includes(error.status ?? 0)
      ? error.status!
      : 503;
  return Response.json(
    {
      message:
        status === 401
          ? "Tu sesión venció."
          : status === 403
            ? "No tienes permisos para consultar esta información."
            : "No se pudo actualizar esta información.",
    },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}
