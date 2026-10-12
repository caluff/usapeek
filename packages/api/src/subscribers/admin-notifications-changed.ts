import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import {
  ADMIN_NOTIFICATION_EVENTS,
  publishAdminNotification,
} from "../lib/admin-notifications/events";

export default async function adminNotificationsChanged({
  event,
  container,
}: SubscriberArgs<unknown>) {
  await publishAdminNotification(container, event.name, event.data);
}

export const config: SubscriberConfig = {
  event: ADMIN_NOTIFICATION_EVENTS,
  context: { subscriberId: "admin-notifications-changed" },
};
