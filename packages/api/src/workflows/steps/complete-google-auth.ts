import { createHash } from "node:crypto";
import { createCustomerAccountWorkflow } from "@medusajs/core-flows";
import { getAuthContextFromJwtToken, type AuthContext } from "@medusajs/framework/http";
import type { AuthIdentityDTO, ConfigModule, IAuthModuleService, ILockingModule, MedusaContainer, ProviderIdentityDTO, UpdateProviderIdentityDTO } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, generateJwtToken, MedusaError, Modules } from "@medusajs/framework/utils";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import type { CompleteGoogleAuthInput, CompleteGoogleAuthResponse } from "../../api/auth/google/complete/contracts";
import { fillGooglePanelProfile } from "./fill-google-panel-profile";

export type CompleteGoogleAuthWorkflowInput = CompleteGoogleAuthInput & { auth_context: AuthContext };

const unauthorized = () => new MedusaError(MedusaError.Types.UNAUTHORIZED, "Google authentication could not be completed. Sign in again.");
const conflict = () => new MedusaError(MedusaError.Types.NOT_ALLOWED, "This Google account is already associated with another account.");
const normalizeEmail = (value: unknown) => typeof value === "string" ? value.trim().toLowerCase() : "";
const googleProvider = (actorType: string) => actorType === "user" ? "google-admin" : "google";

function googleProfile(identity: AuthIdentityDTO, actorType: string) {
  const provider = identity.provider_identities?.find(entry => entry.provider === googleProvider(actorType));
  const email = normalizeEmail(provider?.user_metadata?.email);
  // The installed Google provider validates issuer, audience, signature and email_verified
  // before creating this metadata. Its entity_id is Google's subject, never the email.
  if (!provider?.entity_id || !email || !email.includes("@")) throw unauthorized();
  return { provider, email };
}

async function readActor(container: MedusaContainer, actorType: CompleteGoogleAuthInput["actor_type"], id: string) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: actorType,
    fields: ["id", "email", ...(actorType === "customer" ? ["has_account"] : actorType === "member" ? ["is_active"] : [])],
    filters: { id },
  }, { cache: { enable: false } });
  const actor = data[0];
  if (!actor || (actorType === "customer" && !("has_account" in actor && actor.has_account)) || (actorType === "member" && !("is_active" in actor && actor.is_active))) throw unauthorized();
  return actor;
}

function partialToken(container: MedusaContainer, identityId: string, actorType: string) {
  const { projectConfig: { http } } = container.resolve<ConfigModule>(ContainerRegistrationKeys.CONFIG_MODULE);
  // No actor IDs or roles: the native refresh endpoint must enforce MFA and verification.
  return generateJwtToken({ actor_id: "", actor_type: actorType, auth_identity_id: identityId, auth_provider: googleProvider(actorType), app_metadata: {}, user_metadata: {} }, {
    secret: http.jwtSecret,
    expiresIn: "10m",
    jwtOptions: { ...http.jwtOptions, expiresIn: "10m" },
  });
}

async function attachGoogleProvider(container: MedusaContainer, auth: IAuthModuleService, identity: AuthIdentityDTO, original: AuthIdentityDTO, provider: ProviderIdentityDTO, actorType: CompleteGoogleAuthInput["actor_type"]): Promise<CompleteGoogleAuthResponse> {
  if (Object.entries(identity.app_metadata ?? {}).some(([key, value]) => key.endsWith("_id") && value)) throw conflict();
  if (original.provider_identities?.some(entry => entry.provider === googleProvider(actorType) && entry.id !== provider.id)) throw conflict();
  const token = partialToken(container, original.id, actorType);
  // Auth's installed model and generated service support this foreign key; its public
  // update DTO omits it. Keep the original identity (MFA, verification and all roles).
  const update: UpdateProviderIdentityDTO & Pick<ProviderIdentityDTO, "auth_identity_id"> = { id: provider.id, auth_identity_id: original.id };
  await auth.updateProviderIdentities(update);
  const actorId = original.app_metadata?.[`${actorType}_id`];
  if (typeof actorId === "string") await fillGooglePanelProfile(container, actorType, actorId, provider);
  return { status: "complete", token };
}

export async function completeGoogleAuth(container: MedusaContainer, input: CompleteGoogleAuthWorkflowInput): Promise<CompleteGoogleAuthResponse> {
  if (input.auth_context.actor_type !== input.actor_type || input.auth_context.auth_provider !== googleProvider(input.actor_type)) throw unauthorized();
  const auth = container.resolve<IAuthModuleService>(Modules.AUTH);
  const locking = container.resolve<ILockingModule>(Modules.LOCKING);
  const initial = await auth.retrieveAuthIdentity(input.auth_context.auth_identity_id, { relations: ["provider_identities"] });
  const { email } = googleProfile(initial, input.actor_type);
  // Serialize retries and simultaneous panel/store callbacks for the same Google account.
  const lockKey = `google-auth:${createHash("sha256").update(email).digest("hex")}`;
  return locking.execute(lockKey, async () => {
    const identity = await auth.retrieveAuthIdentity(initial.id, { relations: ["provider_identities"] });
    const { provider, email: currentEmail } = googleProfile(identity, input.actor_type);
    if (email !== currentEmail) throw unauthorized();
    const actorKey = `${input.actor_type}_id`;
    const actorId = identity.app_metadata?.[actorKey];
    let original: AuthIdentityDTO | undefined;
    if (input.existing_token) {
      const { projectConfig: { http } } = container.resolve<ConfigModule>(ContainerRegistrationKeys.CONFIG_MODULE);
      if (!http.jwtSecret) throw unauthorized();
      const proof = getAuthContextFromJwtToken(`Bearer ${input.existing_token}`, http.jwtSecret, ["bearer"], [input.actor_type], http.jwtPublicKey, http.jwtVerifyOptions ?? http.jwtOptions);
      // Actorless tokens include pending MFA/verification and registration tokens.
      if (!proof?.actor_id || !proof.auth_identity_id || proof.auth_provider !== "emailpass") throw unauthorized();
      original = await auth.retrieveAuthIdentity(proof.auth_identity_id, { relations: ["provider_identities"] });
      if (original.app_metadata?.[actorKey] !== proof.actor_id) throw unauthorized();
      const actor = await readActor(container, input.actor_type, proof.actor_id);
      const passwordProvider = original.provider_identities?.find(entry => entry.provider === "emailpass");
      if (normalizeEmail(actor.email) !== email || normalizeEmail(passwordProvider?.entity_id) !== email) throw unauthorized();
      if (actorId && (original.id !== identity.id || actorId !== proof.actor_id)) throw conflict();
    }
    if (actorId) {
      if (typeof actorId !== "string") throw unauthorized();
      const actor = await readActor(container, input.actor_type, actorId);
      if (normalizeEmail(actor.email) !== email) throw unauthorized();
      await fillGooglePanelProfile(container, input.actor_type, actorId, provider);
      return { status: "complete", token: partialToken(container, identity.id, input.actor_type) };
    }

    if (original) {
      return attachGoogleProvider(container, auth, identity, original, provider, input.actor_type);
    }

    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const { data: existingActors } = await query.graph({
      entity: input.actor_type,
      fields: ["id"],
      filters: { email, ...(input.actor_type === "customer" ? { has_account: true } : {}) },
    }, { cache: { enable: false } });
    if (existingActors.length) {
      // Google is authoritative for Gmail ownership. External addresses need another
      // proof: the native provider does not retain the Workspace hd claim.
      // https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
      if (!email.endsWith("@gmail.com")) return { status: "link_required" };
      if (existingActors.length !== 1) throw conflict();
      const originals = await auth.listAuthIdentities({ provider_identities: { provider: "emailpass", entity_id: email } }, { relations: ["provider_identities"], take: 2 });
      if (originals.length !== 1) throw conflict();
      const candidate = originals[0];
      const passwordProviders = candidate.provider_identities?.filter(entry => entry.provider === "emailpass") ?? [];
      if (candidate.id === identity.id || candidate.app_metadata?.[actorKey] !== existingActors[0].id || passwordProviders.length !== 1 || normalizeEmail(passwordProviders[0].entity_id) !== email) throw conflict();
      const actor = await readActor(container, input.actor_type, existingActors[0].id);
      if (normalizeEmail(actor.email) !== email) throw unauthorized();
      return attachGoogleProvider(container, auth, identity, candidate, provider, input.actor_type);
    }
    // Google authentication never provisions panel actors or grants roles.
    if (input.actor_type !== "customer") throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "No account has access to this panel. Sign in with an existing account.");
    const token = partialToken(container, identity.id, input.actor_type);
    await createCustomerAccountWorkflow(container).run({ input: {
      authIdentityId: identity.id,
      customerData: {
        email,
        ...(typeof provider.user_metadata?.given_name === "string" ? { first_name: provider.user_metadata.given_name } : {}),
        ...(typeof provider.user_metadata?.family_name === "string" ? { last_name: provider.user_metadata.family_name } : {}),
      },
    } });
    return { status: "complete", token };
  }, { timeout: 15 });
}

export const completeGoogleAuthStep = createStep("complete-google-auth", async (input: CompleteGoogleAuthWorkflowInput, { container }) => {
  // Linking is atomic; optional profile enrichment reuses native compensated workflows.
  return new StepResponse(await completeGoogleAuth(container, input));
});

export const fillAuthenticatedGooglePanelProfileStep = createStep("fill-authenticated-google-panel-profile", async (context: AuthContext, { container }) => {
  if (!context.actor_id || (context.actor_type !== "user" && context.actor_type !== "member")) throw unauthorized();
  const identity = await container.resolve<IAuthModuleService>(Modules.AUTH).retrieveAuthIdentity(context.auth_identity_id, { relations: ["provider_identities"] });
  if (identity.app_metadata?.[`${context.actor_type}_id`] !== context.actor_id) throw unauthorized();
  const actor = await readActor(container, context.actor_type, context.actor_id);
  if (!identity.provider_identities?.some(provider => provider.provider === googleProvider(context.actor_type))) return new StepResponse({ updated: false });
  const { provider, email } = googleProfile(identity, context.actor_type);
  if (normalizeEmail(actor.email) !== email) throw unauthorized();
  return new StepResponse({ updated: await fillGooglePanelProfile(container, context.actor_type, context.actor_id, provider) });
});
