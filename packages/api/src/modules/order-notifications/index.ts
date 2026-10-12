import { Module } from "@medusajs/framework/utils";
import OrderNotificationsService from "./service";

export const ORDER_NOTIFICATIONS_MODULE = "orderNotifications";
export default Module(ORDER_NOTIFICATIONS_MODULE, {
  service: OrderNotificationsService,
});
