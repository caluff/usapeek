import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import {
  CATALOG_NOTIFICATION_EVENTS,
  notifyCatalogChange,
} from "../lib/catalog/notifications";

export default async function catalogNotificationsChanged({
  event,
  container,
}: SubscriberArgs<unknown>) {
  await notifyCatalogChange(container, event.name, event.data);
}

export const config: SubscriberConfig = {
  event: CATALOG_NOTIFICATION_EVENTS,
  context: { subscriberId: "vendor-catalog-notifications-changed" },
};
