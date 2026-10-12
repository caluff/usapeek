import { createHash, randomBytes } from "node:crypto";
import type { AuthContext } from "@medusajs/framework/http";
import type { ConfigModule, ICachingModuleService, ILockingModule, MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { z } from "@medusajs/framework/zod";
import { generateJwtTokenWithChecks } from "@medusajs/medusa/api/auth/utils/generate-jwt-token";
import type { VendorSessionIssueResponse, VendorSessionConsumeResponse } from "../../api/auth/vendor-session/contracts";
import type { ConsumeVendorSessionInput } from "../../api/auth/vendor-session/validators";
import { loadApplicant, requireVendorAccess } from "../../lib/vendor-onboarding/access";
import { OnboardingError } from "../../lib/vendor-onboarding/errors";

const sessionSchema = z.object({ customer_id: z.string().min(1), auth_identity_id: z.string().min(1), member_id: z.string().min(1), auth_provider: z.enum(["emailpass", "google"]), expires_at: z.number() });
type HandoffSession = z.infer<typeof sessionSchema>;
const unauthorized = () => new MedusaError(MedusaError.Types.UNAUTHORIZED, "The seller session could not be transferred. Return to your customer account and try again.");
const cacheKey = (code: string) => `vendor-session:${createHash("sha256").update(code).digest("hex")}`;

async function authorizedMember(container: MedusaContainer, input: Pick<HandoffSession, "customer_id" | "auth_identity_id" | "auth_provider">) {
  const live = await loadApplicant(container, input);
  const allowedProviders = container.resolve<ConfigModule>(ContainerRegistrationKeys.CONFIG_MODULE).projectConfig.http.authMethodsPerActor?.member;
  if ((allowedProviders && !allowedProviders.includes(input.auth_provider)) || !live.identity.provider_identities?.some(provider => provider.provider === input.auth_provider) || !live.member?.is_active || !live.memberships.length) throw unauthorized();
  for (const membership of live.memberships) {
    if (membership.member_id !== live.member.id) continue;
    try {
      await requireVendorAccess(container, live.member.id, membership.seller_id);
      return live;
    } catch (error) {
      if (!(error instanceof OnboardingError)) throw error;
    }
  }
  throw unauthorized();
}

export async function issueVendorSession(container: MedusaContainer, context: AuthContext): Promise<VendorSessionIssueResponse> {
  if (context.actor_type !== "customer" || !context.actor_id || !context.auth_identity_id || !["emailpass", "google"].includes(context.auth_provider ?? "")) throw unauthorized();
  const expiration = "exp" in context && typeof context.exp === "number" ? context.exp * 1000 : 0;
  if (expiration <= Date.now()) throw unauthorized();
  const input = { customer_id: context.actor_id, auth_identity_id: context.auth_identity_id, auth_provider: context.auth_provider as "emailpass" | "google" };
  const live = await authorizedMember(container, input);
  const code = randomBytes(32).toString("hex");
  const data: HandoffSession = { ...input, member_id: live.member!.id, expires_at: Math.min(expiration, Date.now() + 60_000) };
  await container.resolve<ICachingModuleService>(Modules.CACHING).set({ key: cacheKey(code), data, ttl: 60, options: { autoInvalidate: false } });
  return { code };
}

export async function consumeVendorSession(container: MedusaContainer, input: ConsumeVendorSessionInput): Promise<VendorSessionConsumeResponse> {
  const key = cacheKey(input.code);
  const caching = container.resolve<ICachingModuleService>(Modules.CACHING);
  return container.resolve<ILockingModule>(Modules.LOCKING).execute(key, async () => {
    const parsed = sessionSchema.safeParse(await caching.get({ key }));
    if (!parsed.success) throw unauthorized();
    // Delete under the same distributed lock before issuing any session: codes are single use.
    await caching.clear({ key });
    if (parsed.data.expires_at <= Date.now()) throw unauthorized();
    const live = await authorizedMember(container, parsed.data);
    if (live.member!.id !== parsed.data.member_id) throw unauthorized();
    // The source token already passed identity-level MFA. Reuse that authentication,
    // but apply the native member verification policy and generate current member roles.
    const result = await generateJwtTokenWithChecks(container, { authIdentity: live.identity, actorType: "member", authProvider: parsed.data.auth_provider });
    if (result.verification_required) return { status: "verification_required", token: result.token, email: live.email };
    return { status: "authenticated", token: result.token };
  }, { timeout: 10 });
}

export const issueVendorSessionStep = createStep("issue-vendor-session", async (input: AuthContext, { container }) => new StepResponse(await issueVendorSession(container, input)));
export const consumeVendorSessionStep = createStep("consume-vendor-session", async (input: ConsumeVendorSessionInput, { container }) => new StepResponse(await consumeVendorSession(container, input)));
