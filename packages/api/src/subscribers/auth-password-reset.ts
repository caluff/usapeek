import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { MedusaError } from "@medusajs/framework/utils";
import { authNotificationKey, deliverEmailNotification } from "../lib/deliver-email-notification";

import {
  buildAuthEmailUrl,
  getAuthEmailConfiguration,
  isAuthActor,
  requiredAppUrlVariable,
} from "../lib/auth-email";

type PasswordResetEvent = {
  entity_id: string;
  token: string;
  actor_type: string;
};

export default async function authPasswordResetHandler({
  event: { data },
  container,
}: SubscriberArgs<PasswordResetEvent>) {
  const emailConfig = getAuthEmailConfiguration();
  if (!emailConfig.enabled || !isAuthActor(data.actor_type)) return;

  const resetUrl = buildAuthEmailUrl(
    "password-reset",
    data.actor_type,
    data.token,
    data.entity_id,
  );
  if (!resetUrl) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `[auth-email] ${requiredAppUrlVariable(data.actor_type)} must be a valid public URL`,
    );
  }

  await deliverEmailNotification(container, {
    to: data.entity_id,
    from: emailConfig.from,
    channel: "email",
    template: "auth-password-reset",
    trigger_type: "auth.password_reset",
    idempotency_key: authNotificationKey("password-reset", data.actor_type, data.entity_id, data.token),
    data: { reset_url: resetUrl },
  });
}

export const config: SubscriberConfig = {
  event: "auth.password_reset",
};
