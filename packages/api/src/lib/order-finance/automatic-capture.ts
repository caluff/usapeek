import { createHash } from "node:crypto";
import type { MedusaContainer } from "@medusajs/framework/types";
import { readPaymentCaptureSettings } from "./capture-settings";
import { readOrderFinance } from "./read";
import { operateOrderFinanceWorkflow } from "../../workflows/operate-order-finance";

export function automaticCaptureRequestId(groupId: string): string {
  const hash = createHash("sha256")
    .update(`automatic-capture:${groupId}`)
    .digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export async function capturePreparedPurchase(
  container: MedusaContainer,
  orderId: string,
) {
  const settings = await readPaymentCaptureSettings(container);
  if (settings.mode !== "automatic" || !settings.actor_id) return "manual";
  const current = await readOrderFinance(container, orderId, {
    actor_id: settings.actor_id,
  });
  const anchor = current.group.orders
    .filter((order) => order.status !== "canceled")
    .sort((left, right) => left.id.localeCompare(right.id))[0];
  if (!anchor || current.finalCapture) return "skipped";
  // Always evaluate from the same active order, including cancellation events.
  const candidate =
    anchor.id === orderId
      ? current
      : await readOrderFinance(container, anchor.id, {
          actor_id: settings.actor_id,
        });
  if (!candidate.view.finance.capture.allowed) return "skipped";
  await operateOrderFinanceWorkflow(container).run({
    input: {
      order_id: anchor.id,
      actor_id: settings.actor_id,
      automatic_capture_revision: settings.revision,
      action: "capture",
      note: "Cobro automático: todos los pedidos activos están preparados.",
      confirm: true,
      request_id: automaticCaptureRequestId(current.group.id),
    },
  });
  return "captured";
}
