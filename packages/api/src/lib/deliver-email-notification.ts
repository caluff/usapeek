import { createHash } from "node:crypto";
import type { CreateNotificationDTO, FilterableNotificationProps, MedusaContainer, NotificationDTO } from "@medusajs/framework/types";
import { MedusaError, Modules } from "@medusajs/framework/utils";

export function authNotificationKey(kind: string, actor: string, recipient: string, secret: string) {
  return `auth-email/${createHash("sha256").update(JSON.stringify([kind, actor, recipient, secret])).digest("hex")}`;
}

export async function deliverEmailNotification(
  container: MedusaContainer,
  input: CreateNotificationDTO & { idempotency_key: string },
): Promise<NotificationDTO> {
  const notifications = container.resolve(Modules.NOTIFICATION);
  const locking = container.resolve(Modules.LOCKING);
  const lockKey = `email-notification/${createHash("sha256").update(input.idempotency_key).digest("hex")}`;
  // The persisted model supports this filter; Medusa 2.18 omits it from the
  // public filter type while using it internally for the same lookup.
  const filter: FilterableNotificationProps & Pick<CreateNotificationDTO, "idempotency_key"> = { idempotency_key: input.idempotency_key };
  return locking.execute(lockKey, async () => {
    const [previous] = await notifications.listNotifications(filter);
    if (previous?.status === "success") return previous;
    if (previous && previous.status !== "failure") {
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "[notification] Email is not confirmed sent; inspect the pending notification before recovery");
    }

    // Medusa 2.18 spreads the input ID but does not reuse the failed row ID
    // itself. Its retry/dedup return also omits existing rows. Preserve that ID
    // and re-read status; remove this adapter once upstream fixes both cases.
    const request: CreateNotificationDTO & Partial<Pick<NotificationDTO, "id">> = {
      ...input,
      ...(previous ? { id: previous.id } : {}),
    };
    const created = await notifications.createNotifications(request);
    const result = created ?? (await notifications.listNotifications(filter))[0];
    if (result?.status !== "success") throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "[notification] Email delivery did not succeed");
    return result;
  }, { timeout: 30 });
}
