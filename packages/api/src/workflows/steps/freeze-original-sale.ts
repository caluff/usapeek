import type { MedusaContainer } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  MathBN,
  MedusaError,
} from "@medusajs/framework/utils";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { MercurModules } from "@mercurjs/types";
import type CommissionService from "../../modules/commission/service";
import { COMMERCE_AUTOMATION_MODULE } from "../../modules/commerce-automation";
import type CommerceAutomationService from "../../modules/commerce-automation/service";
import {
  assertOriginalGroup,
  buildOriginalSale,
  originalSaleSchema,
  saleGroupSchema,
} from "../../lib/order-finance/snapshot";

const fields = [
  "id",
  "cart_id",
  "orders.id",
  "orders.version",
  "orders.total",
  "orders.currency_code",
  "orders.seller.id",
  "orders.items.*",
  "orders.items.detail.*",
  "orders.items.tax_lines.*",
  "orders.items.adjustments.*",
  "orders.items.product.id",
  "orders.items.product.collection_id",
  "orders.items.product.type_id",
  "orders.items.product.categories.id",
  "orders.items.product.tags.id",
  "orders.items.offer.seller_id",
  "orders.shipping_methods.*",
  "orders.shipping_methods.tax_lines.*",
  "orders.shipping_methods.adjustments.*",
  "orders.cart.id",
  "orders.cart.payment_collection.id",
  "orders.cart.payment_collection.amount",
  "orders.cart.payment_collection.payment_sessions.id",
  "orders.cart.payment_collection.payment_sessions.status",
];

export type OriginalSaleCompensation = {
  sale_ids: string[];
  commission_line_ids: string[];
};

export async function freezeOriginalSale(
  container: MedusaContainer,
  cartId: string,
): Promise<OriginalSaleCompensation> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph(
    { entity: "order_group", fields, filters: { cart_id: cartId } },
    { cache: { enable: false } },
  );
  if (data.length !== 1)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "No se pudo verificar el grupo original de la venta.",
    );
  const group = saleGroupSchema.parse(data[0]);
  const journal = container.resolve<CommerceAutomationService>(
    COMMERCE_AUTOMATION_MODULE,
  );
  const commission = container.resolve<CommissionService>(
    MercurModules.COMMISSION,
  );
  const existing = await journal.listFinanceSaleSnapshots(
    { group_id: group.id },
    { take: 51 },
  );
  if (existing.length && existing.length !== group.orders.length) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "El grupo tiene un original incompleto y requiere conciliación.",
    );
  }
  const priorLines = await commission.listCommissionLines({
    $or: [
      {
        item_id: group.orders.flatMap((order) =>
          order.items.map((line) => line.id),
        ),
      },
      {
        shipping_method_id: group.orders.flatMap((order) =>
          order.shipping_methods.map((line) => line.id),
        ),
      },
    ],
  });
  if (!existing.length && priorLines.length) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Las líneas históricas no demuestran un original financiero. Requieren conciliación.",
    );
  }
  const sales = await Promise.all(
    group.orders.map(async (order) => {
      const prior = existing.find((sale) => sale.id === order.id);
      if (prior) return originalSaleSchema.parse(prior.original);
      if (
        order.cart.id !== cartId ||
        order.items.some((item) => item.offer?.seller_id !== order.seller.id)
      ) {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "La venta no tiene un vendedor o carrito inequívoco.",
        );
      }
      const resolved = await commission.calculateOriginalLines({
        currency_code: order.currency_code,
        items: order.items.map((item) => ({
          id: item.id,
          subtotal: item.subtotal,
          tax_total: item.tax_total,
          product: item.product
            ? {
                ...item.product,
                collection_id: item.product.collection_id ?? undefined,
                type_id: item.product.type_id ?? undefined,
                seller: { id: order.seller.id },
              }
            : undefined,
        })),
        shipping_methods: order.shipping_methods.map((method) => ({
          id: method.id,
          subtotal: method.subtotal,
          tax_total: method.tax_total,
        })),
      });
      return buildOriginalSale(group, order, resolved);
    }),
  );
  assertOriginalGroup(sales, group);
  if (
    sales.some(
      (sale) =>
        !MathBN.eq(
          sale.gross,
          group.orders.find((order) => order.id === sale.order_id)!.total,
        ),
    )
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "El pedido cambió después de fijar su original financiero.",
    );
  }
  const created = await journal.recordOriginalSales(sales);
  try {
    const saved = await commission.upsertCommissionLines(
      sales.flatMap((sale) =>
        sale.commission_lines.map((line) => ({
          item_id: line.item_id,
          shipping_method_id: line.shipping_method_id,
          commission_rate_id: line.commission_rate_id,
          code: line.code,
          rate: line.rate,
          amount: line.amount,
          description: line.shipping_method_id ? "Shipping Commission" : null,
        })),
      ),
    );
    const createdAnchors = new Set(
      sales
        .filter((sale) => created.includes(sale.order_id))
        .flatMap((sale) =>
          sale.commission_lines.map(
            (line) => line.item_id ?? line.shipping_method_id,
          ),
        ),
    );
    const priorIds = new Set(priorLines.map((line) => line.id));
    return {
      sale_ids: created,
      commission_line_ids: saved
        .filter(
          (line) =>
            !priorIds.has(line.id) &&
            createdAnchors.has(line.item_id ?? line.shipping_method_id),
        )
        .map((line) => line.id),
    };
  } catch (error) {
    await journal.discardOriginalSales(created);
    throw error;
  }
}

export async function discardOriginalSale(
  container: MedusaContainer,
  receipt?: OriginalSaleCompensation,
) {
  if (!receipt?.sale_ids.length) return;
  const commission = container.resolve<CommissionService>(
    MercurModules.COMMISSION,
  );
  await commission.deleteCommissionLines(receipt.commission_line_ids);
  await container
    .resolve<CommerceAutomationService>(COMMERCE_AUTOMATION_MODULE)
    .discardOriginalSales(receipt.sale_ids);
}

export const freezeOriginalSaleStep = createStep(
  "freeze-original-sale",
  async (input: { cart_id: string }, { container }) => {
    const receipt = await freezeOriginalSale(container, input.cart_id);
    return new StepResponse(receipt, receipt);
  },
  async (receipt, { container }) => discardOriginalSale(container, receipt),
);
