import type { MedusaContainer } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import { listSellerShippingOptionsForCartWorkflow } from "@mercurjs/core/workflows";

export function assertSelectedShippingOptionsAvailable(
  selected: string[],
  available: Record<string, { id: string }[]>,
) {
  const availableIds = new Set(
    Object.values(available).flatMap((options) =>
      options.map((option) => option.id),
    ),
  );
  if (selected.some((id) => !availableIds.has(id))) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Una tarifa de envío o recogida ya no está disponible para tu dirección. Vuelve a seleccionar la entrega.",
    );
  }
}

export async function assertCartShippingStillAvailable(
  container: MedusaContainer,
  cartId: string,
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: carts } = await query.graph(
    {
      entity: "cart",
      fields: ["id", "completed_at", "shipping_methods.shipping_option_id"],
      filters: { id: cartId },
    },
    { cache: { enable: false } },
  );
  const cart = carts[0];
  if (!cart || cart.completed_at) return;
  const selected = (cart.shipping_methods ?? [])
    .map((method) => method?.shipping_option_id)
    .filter((id): id is string => !!id);
  if (!selected.length) return; // Native completion validates required shipping methods.
  const { result } = await listSellerShippingOptionsForCartWorkflow(
    container,
  ).run({ input: { cart_id: cartId, is_return: false } });
  assertSelectedShippingOptionsAvailable(selected, result);
}
