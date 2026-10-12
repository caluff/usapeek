export type SpamProtectionBucket = {
  scope: string;
  subject: string;
  limit: number;
  windowSeconds: number;
};

type Submission = {
  method: string;
  path: string;
  ip?: string;
  body?: unknown;
  authIdentityId?: string;
};

function emailIdentifier(
  body: unknown,
  field: "identifier" | "email" | "entity_id",
) {
  if (!body || typeof body !== "object") return undefined;
  const value =
    field in body ? (body as Record<string, unknown>)[field] : undefined;
  if (typeof value === "string" && value.length <= 320 && value.includes("@")) {
    return value.trim().toLowerCase();
  }
}

export function spamProtectionBuckets(
  input: Submission,
): SpamProtectionBucket[] {
  if (input.method !== "POST") return [];
  let path: string;
  try {
    // Express decodes route parameters and matches literal paths without case
    // sensitivity. Apply the same normalization before selecting a budget.
    path = decodeURI(input.path).replace(/\/+$/, "").toLowerCase();
  } catch {
    return []; // Express rejects malformed URI encodings before route execution.
  }
  const ip = input.ip || "unknown";
  // Use the field consumed by the native route; unrelated body fields must not
  // let a caller select a different recipient's budget.
  const email = emailIdentifier(
    input.body,
    path.endsWith("/reset-password")
      ? "identifier"
      : path === "/auth/verification/request"
        ? "entity_id"
        : "email",
  );
  const identity = input.authIdentityId;
  const buckets: SpamProtectionBucket[] = [];
  const add = (
    scope: string,
    subject: string,
    limit: number,
    windowSeconds: number,
  ) => {
    buckets.push({ scope, subject, limit, windowSeconds });
  };

  const isAuth =
    /^\/auth\/(?:customer|user|member)\/(?:emailpass|google|google-admin)(?:\/(?:register|reset-password|update|callback))?$/.test(
      path,
    ) ||
    /^\/auth\/verification\/(?:request|confirm)$/.test(path) ||
    /^\/auth\/mfa\/challenges\/[^/]+\/verify$/.test(path) ||
    /^\/auth\/google\/(?:complete|one-tap\/transaction)$/.test(path) ||
    /^\/auth\/account\/email-verification\/(?:request|confirm)$/.test(path);
  if (isAuth) {
    // The transport network is selected by the deployment's trusted ingress.
    // Server-side SDK calls can share this network budget across visitors.
    add("auth-network-minute", ip, 120, 60);
    add("auth-network-hour", ip, 600, 3600);
  }

  if (/^\/auth\/(?:customer|user|member)\/emailpass$/.test(path) && email) {
    add("login-address-network", JSON.stringify([ip, email]), 12, 900);
  }
  if (/^\/auth\/(?:customer|user|member)\/[^/]+\/register$/.test(path)) {
    add("registration-network", ip, 30, 3600);
    if (email) add("registration-address", email, 3, 3600);
  }

  const isReset =
    /^\/auth\/(?:customer|user|member)\/emailpass\/reset-password$/.test(path);
  const isVerification =
    path === "/auth/verification/request" ||
    path === "/auth/account/email-verification/request" ||
    path === "/store/vendor-application/verification";
  if (isReset || isVerification) {
    add("email-network", ip, 100, 3600);
    if (email) {
      add("email-address-hour", email, 5, 3600);
      add("email-address-cooldown", email, 1, 60);
    }
    // All verification entry points share this budget, even when the caller
    // omits or changes an entity_id. The identity comes from authentication.
    if (isVerification && identity) {
      add("verification-identity-hour", identity, 5, 3600);
      add("verification-identity-cooldown", identity, 1, 60);
    }
  }

  if (
    /^\/auth\/verification\/confirm$/.test(path) ||
    /^\/auth\/account\/email-verification\/confirm$/.test(path) ||
    /^\/auth\/mfa\/challenges\/[^/]+\/verify$/.test(path)
  ) {
    add("verification-attempts", identity || ip, 20, 900);
  }
  if (path === "/store/customers") {
    add("customer-creation-network", ip, 100, 3600);
    if (identity) add("customer-creation-identity", identity, 5, 3600);
  }
  if (
    path === "/store/order-tracking" ||
    path === "/store/order-tracking/claim"
  ) {
    add("order-tracking-network", ip, 120, 60);
    if (identity) add("order-tracking-identity", identity, 60, 60);
  }
  if (path === "/store/vendor-application" && identity) {
    add("application-save", identity, 120, 3600);
  }
  if (path === "/store/vendor-application/submit" && identity) {
    add("application-submit", identity, 5, 3600);
  }
  return buckets;
}
