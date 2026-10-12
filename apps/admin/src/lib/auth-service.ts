import { FetchError } from "@medusajs/js-sdk";
import type Medusa from "@medusajs/js-sdk";
import type { HttpTypes } from "@medusajs/types";

export const INVALID_CREDENTIALS =
  "No pudimos iniciar sesión con esos datos. Revisa el correo y la contraseña.";

export const AUTH_SERVICE_UNAVAILABLE =
  "No pudimos conectar con el servicio de acceso. Intenta nuevamente en unos momentos.";

export function isAdminAuthDenied(error: unknown) {
  return (
    error instanceof FetchError &&
    (error.status === 401 || error.status === 403)
  );
}

export function adminLoginErrorMessage(error: unknown) {
  return isAdminAuthDenied(error)
    ? INVALID_CREDENTIALS
    : AUTH_SERVICE_UNAVAILABLE;
}

export async function retrieveAdminUser(
  client: Pick<Medusa["admin"]["user"], "me"> | undefined,
): Promise<HttpTypes.AdminUser | null> {
  if (!client) throw new Error("Admin backend is not configured");

  try {
    return (await client.me()).user;
  } catch (error) {
    if (isAdminAuthDenied(error)) return null;
    throw error;
  }
}
