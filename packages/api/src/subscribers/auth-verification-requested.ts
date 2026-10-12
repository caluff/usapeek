import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { MedusaError } from "@medusajs/framework/utils";
import { authNotificationKey, deliverEmailNotification } from "../lib/deliver-email-notification";

import {
  buildAuthEmailUrl,
  getAuthEmailConfiguration,
  isAuthActor,
  requiredAppUrlVariable,
} from "../lib/auth-email";

type VerificationRequestedEvent = {
  entity_id: string;
  entity_type: string;
  code: string;
  expires_at: string | Date;
  metadata?: Record<string, unknown> | null;
};

export default async function authVerificationRequestedHandler({
  event: { data },
  container,
}: SubscriberArgs<VerificationRequestedEvent>) {
  const emailConfig = getAuthEmailConfiguration();
  const actor = data.metadata?.actor_type;
  if (
    !emailConfig.enabled ||
    data.entity_type !== "email" ||
    !isAuthActor(actor)
  ) {
    return;
  }

  const verificationUrl = buildAuthEmailUrl(
    "email-verification",
    actor,
    data.code,
    data.entity_id,
  );
  if (!verificationUrl) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `[auth-email] ${requiredAppUrlVariable(actor)} must be a valid public URL`,
    );
  }

  const deliveryUrl = new URL(verificationUrl);
  if (actor === "customer" && data.metadata?.vendor_onboarding === true) {
    deliveryUrl.searchParams.set("next", "/account/sell");
  }
  await deliverEmailNotification(container, {
    to: data.entity_id,
    from: emailConfig.from,
    channel: "email",
    template: "auth-email-verification",
    trigger_type: "auth.verification_requested",
    idempotency_key: authNotificationKey("email-verification", actor, data.entity_id, data.code),
    data: {
      verification_url: deliveryUrl.toString(),
      expires_at: data.expires_at,
    },
  });
}

export const config: SubscriberConfig = {
  event: "auth.verification_requested",
};
