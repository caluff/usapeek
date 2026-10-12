import type { AuthContext } from "@medusajs/framework/http";
import type { IAuthModuleService, MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";
import type { AccountEmailVerificationResponse } from "../api/auth/account/email-verification/contracts";

const normalizeEmail = (value: unknown) => typeof value === "string" ? value.trim().toLowerCase() : "";
const unauthorized = () => new MedusaError(MedusaError.Types.UNAUTHORIZED, "Account identity changed. Sign in again.");

export async function getAccountEmailVerification(container: MedusaContainer, context: AuthContext): Promise<AccountEmailVerificationResponse> {
  if (context.actor_type !== "user" && context.actor_type !== "member") throw unauthorized();
  const auth = container.resolve<IAuthModuleService>(Modules.AUTH);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const [identity, { data }] = await Promise.all([
    auth.retrieveAuthIdentity(context.auth_identity_id, { relations: ["provider_identities"] }),
    query.graph({
      entity: context.actor_type,
      fields: ["id", "email", ...(context.actor_type === "member" ? ["is_active"] : [])],
      filters: { id: context.actor_id },
    }, { cache: { enable: false } }),
  ]);
  const actor = data[0];
  if (!actor || identity.app_metadata?.[`${context.actor_type}_id`] !== context.actor_id || ("is_active" in actor && !actor.is_active)) throw unauthorized();
  const actorEmail = normalizeEmail(actor.email);
  const google = identity.provider_identities?.find(provider => provider.provider === (context.actor_type === "user" ? "google-admin" : "google"));
  const password = identity.provider_identities?.find(provider => provider.provider === "emailpass");
  const googleMatches = !!google?.entity_id && normalizeEmail(google.user_metadata?.email) === actorEmail;
  const passwordMatches = !!password?.entity_id && normalizeEmail(password.entity_id) === actorEmail;
  if (!actorEmail || (!googleMatches && !passwordMatches)) throw unauthorized();
  // Native emailpass verification uses its exact entity_id, including legacy casing.
  const email = passwordMatches ? password!.entity_id : actor.email!;
  const verifications = await auth.listAuthVerifications({ auth_identity_id: identity.id, entity_type: "email", entity_id: email });
  if (verifications.some(verification => !!verification.verified_at)) return { email, status: "verified", source: "email" };
  // Native Google authentication validates the signed email_verified claim.
  const googleVerified = googleMatches && actorEmail.endsWith("@gmail.com");
  return { email, status: googleVerified ? "verified" : "unverified", source: googleVerified ? "google" : null };
}
