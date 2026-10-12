import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import {
  ContainerRegistrationKeys,
  MathBN,
  MedusaError,
} from "@medusajs/framework/utils";
import type { FinanceActor } from "../lib/order-finance/read";
import {
  assertCustomerReturnMetadataIsReadOnly,
  assertMarketplaceReturnFinance,
} from "../lib/order-finance/returns";
import { assertSellerWarehouseLocations } from "../lib/vendor-warehouse/access";
import { decimal } from "../lib/order-finance/policy";

type Input = FinanceActor & {
  order_id: string;
  token?: string;
  location_id?: string;
  return_id?: string;
  confirm_request?: boolean;
  metadata?: unknown;
};
const validateMarketplaceReturnStep = createStep(
  "validate-marketplace-return",
  async (input: Input, { container }) => {
    assertCustomerReturnMetadataIsReadOnly(input.metadata);
    const current = await assertMarketplaceReturnFinance(
      container,
      input.order_id,
      input,
      input.token,
    );
    let location = input.location_id;
    if (input.return_id) {
      const { data } = await container
        .resolve(ContainerRegistrationKeys.QUERY)
        .graph(
          {
            entity: "return",
            fields: ["order_id", "location_id"],
            filters: { id: input.return_id },
          },
          { cache: { enable: false } },
        );
      if (data[0]?.order_id !== input.order_id)
        throw new MedusaError(
          MedusaError.Types.NOT_FOUND,
          "Devolución no encontrada.",
        );
      location ??= data[0].location_id ?? undefined;
    }
    if (input.confirm_request) {
      if (!location)
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Selecciona el almacén de destino antes de aprobar la devolución.",
        );
      const { data: changes } = await container
        .resolve(ContainerRegistrationKeys.QUERY)
        .graph(
          {
            entity: "order_change",
            fields: ["actions.action", "actions.details"],
            filters: {
              order_id: input.order_id,
              return_id: input.return_id,
              status: ["pending", "requested"],
            },
          },
          { cache: { enable: false } },
        );
      const quantities = new Map<string, number>();
      for (const action of changes.flatMap((change) => change.actions ?? [])) {
        if (action?.action !== "RETURN_ITEM") continue;
        const id = action.details?.reference_id;
        const quantity = decimal.parse(action.details?.quantity);
        if (typeof id !== "string" || !MathBN.gt(quantity, 0))
          throw new MedusaError(
            MedusaError.Types.INVALID_DATA,
            "Artículo de devolución no válido.",
          );
        quantities.set(
          id,
          MathBN.add(quantities.get(id) ?? 0, quantity).toNumber(),
        );
      }
      const order = current.group.orders.find(
        (order) => order.id === input.order_id,
      )!;
      for (const [id, quantity] of quantities) {
        const item = order.items?.find((item) => item.id === id);
        if (
          !item ||
          MathBN.gt(
            quantity,
            MathBN.sub(
              item.detail.fulfilled_quantity,
              MathBN.add(
                decimal.parse(item.detail.return_requested_quantity ?? 0),
                decimal.parse(item.detail.return_received_quantity ?? 0),
                decimal.parse(item.detail.return_dismissed_quantity ?? 0),
              ),
            ),
          )
        ) {
          throw new MedusaError(
            MedusaError.Types.INVALID_DATA,
            "La cantidad supera los artículos disponibles; revisa las devoluciones anteriores.",
          );
        }
      }
    }
    if (location) {
      const sellerId = current.group.orders.find(
        (order) => order.id === input.order_id,
      )!.seller.id;
      await assertSellerWarehouseLocations(container, sellerId, [location]);
    }
    return new StepResponse(undefined);
  },
);
export const validateMarketplaceReturnWorkflow = createWorkflow(
  "validate-marketplace-return",
  function (input: Input) {
    return new WorkflowResponse(validateMarketplaceReturnStep(input));
  },
);
