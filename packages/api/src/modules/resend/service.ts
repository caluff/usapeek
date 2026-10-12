import { createHash } from "node:crypto";
import type { ProviderSendNotificationDTO, ProviderSendNotificationResultsDTO } from "@medusajs/framework/types";
import { AbstractNotificationProviderService, MedusaError } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import { Resend } from "resend";
import { resendOptionsSchema, type ResendOptions } from "./configuration";
import { renderNotification } from "./templates";

export default class ResendNotificationProviderService extends AbstractNotificationProviderService {
  static identifier = "resend";
  private readonly client: Resend;
  private readonly options: ResendOptions;

  static validateOptions(options: Record<string, unknown>) {
    if (!resendOptionsSchema.safeParse(options).success) throw new MedusaError(MedusaError.Types.INVALID_DATA, "[resend] Invalid provider configuration; check RESEND_API_KEY and RESEND_FROM_EMAIL (or AUTH_EMAIL_FROM)");
  }

  constructor(container: Record<string, unknown>, options: ResendOptions) {
    super();
    ResendNotificationProviderService.validateOptions(options);
    this.options = resendOptionsSchema.parse(options);
    this.client = new Resend(this.options.api_key);
  }

  async send(notification: ProviderSendNotificationDTO): Promise<ProviderSendNotificationResultsDTO> {
    if (notification.channel !== "email") throw new MedusaError(MedusaError.Types.INVALID_DATA, "[resend] Only the email channel is supported");
    if (notification.from && notification.from !== this.options.from) throw new MedusaError(MedusaError.Types.INVALID_DATA, "[resend] Notification sender must match the configured sender");
    if (!z.email().safeParse(notification.to).success) throw new MedusaError(MedusaError.Types.INVALID_DATA, "[resend] Invalid recipient email address");
    // Medusa 2.18 passes the persisted notification through, including its
    // idempotency_key, even though ProviderSendNotificationDTO omits that field.
    const key = "idempotency_key" in notification ? notification.idempotency_key : undefined;
    if (typeof key !== "string" || !key.trim()) throw new MedusaError(MedusaError.Types.INVALID_DATA, "[resend] A notification idempotency key is required");
    let content: ReturnType<typeof renderNotification>;
    try {
      content = renderNotification(notification.template, notification.data);
    } catch {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "[resend] Unsupported template or invalid notification data");
    }
    const idempotencyKey = `medusa-email/${createHash("sha256").update(key).digest("hex")}`;
    let result: Awaited<ReturnType<Resend["emails"]["send"]>>;
    try {
      result = await this.client.emails.send({ from: this.options.from, to: notification.to, ...content }, { idempotencyKey });
    } catch {
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "[resend] Email request failed; delivery can be retried");
    }
    // The SDK resolves API failures instead of throwing. Never acknowledge them
    // as success, and never log response bodies that might contain auth links.
    if (result.error || !result.data?.id) {
      const status = result.error?.statusCode;
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, `[resend] Email was not accepted${typeof status === "number" ? ` (HTTP ${status})` : ""}; check sender verification, API access, and provider availability`);
    }
    return { id: result.data.id };
  }
}
