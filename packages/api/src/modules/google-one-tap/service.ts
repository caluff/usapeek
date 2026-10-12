import { randomUUID } from "node:crypto";
import NativeGoogleAuthModule from "@medusajs/medusa/auth-google";
import type { AuthenticationInput, AuthenticationResponse, AuthIdentityProviderService, GoogleAuthProviderOptions, IAuthProvider, ILockingModule, Logger } from "@medusajs/framework/types";
import { GoogleOneTapLoginInputSchema } from "../../lib/google-one-tap/contracts";
import { assertVerifiedGoogleOneTapClaims, googleOneTapRedemptionKey, invalidGoogleOneTap, readGoogleOneTapTransaction } from "../../lib/google-one-tap/transaction";

type Options = GoogleAuthProviderOptions & { oneTapSecret: string };
type Dependencies = { logger: Logger; locking: ILockingModule };
type NativeGoogleConstructor = {
  new(dependencies: { logger: Logger }, options: GoogleAuthProviderOptions): IAuthProvider & {
    verify_(idToken: string, identities: AuthIdentityProviderService): Promise<AuthenticationResponse>;
  };
  validateOptions(options: GoogleAuthProviderOptions): void;
};

// The public Medusa export exposes its native service constructor through the
// provider definition, but erases the type of verify_ (inspected in version 2.18).
const GoogleAuthService = NativeGoogleAuthModule.services![0] as unknown as NativeGoogleConstructor;

export default class GoogleOneTapAuthService extends GoogleAuthService {
  static identifier = "google";
  private readonly locking: ILockingModule;
  private readonly oneTapSecret: string;
  private readonly clientId: string;

  static validateOptions(options: Options) {
    GoogleAuthService.validateOptions(options);
    if (!options.oneTapSecret || options.oneTapSecret.length < 32) throw new Error("Google One Tap requires the configured authentication signing secret.");
  }

  constructor(dependencies: Dependencies, options: Options) {
    super(dependencies, options);
    this.locking = dependencies.locking;
    this.oneTapSecret = options.oneTapSecret;
    this.clientId = options.clientId;
  }

  async authenticate(req: AuthenticationInput, identities: AuthIdentityProviderService): Promise<AuthenticationResponse> {
    const body = req.body ?? {};
    if (!("id_token" in body) && !("transaction_token" in body)) return super.authenticate(req, identities);
    try {
      const input = GoogleOneTapLoginInputSchema.parse(body);
      const actorType = "actor_type" in req ? req.actor_type : undefined;
      if (actorType !== "customer" || req.url?.split("?")[0].replace(/\/$/, "") !== "/auth/customer/google"
        || req.query?.code !== undefined || req.query?.state !== undefined) throw invalidGoogleOneTap();
      readGoogleOneTapTransaction(input.transaction_token, this.clientId, this.oneTapSecret);
      let subject: string | undefined;
      const guardedIdentities: AuthIdentityProviderService = {
        ...identities,
        retrieve: async (selector) => {
          const claims = assertVerifiedGoogleOneTapClaims(input.id_token, input.transaction_token, this.clientId, this.oneTapSecret);
          if (claims.subject !== selector.entity_id) throw invalidGoogleOneTap();
          // Keep this Redis marker until the proof expires. Releasing it on success
          // (or compensating an authentication failure) would allow credential replay.
          await this.locking.acquire(googleOneTapRedemptionKey(input.transaction_token), {
            ownerId: randomUUID(),
            expire: Math.max(1, claims.expires_at - Math.floor(Date.now() / 1000)) + 60,
          });
          subject = claims.subject;
          return identities.retrieve(selector);
        },
        create: async (data) => {
          if (!subject || data.entity_id !== subject) throw invalidGoogleOneTap();
          return identities.create(data);
        },
        update: async () => { throw invalidGoogleOneTap(); },
      };
      // The installed verifier calls the facade only after verifying Google's
      // signature and standard claims. The facade adds nonce/strict claim checks.
      const result = await super.verify_(input.id_token, guardedIdentities);
      if (!result.success || !result.authIdentity) throw invalidGoogleOneTap();
      return result;
    } catch {
      return { success: false, error: invalidGoogleOneTap().message };
    }
  }
}
