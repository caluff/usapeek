import {
  MathBN,
  MedusaError,
  PaymentSessionStatus,
} from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import { decimal, financeAmount, type FinanceAllocation } from "./policy";
import type { ResolvedCommissionLine } from "./commission-policy";

const money = z
  .number()
  .finite()
  .nonnegative()
  .refine((value) => {
    try {
      return financeAmount(value) === value;
    } catch {
      return false;
    }
  }, "Expected exact USD amount");
const componentsSchema = z.object({
  merchandise_subtotal: money,
  merchandise_discount: money,
  merchandise_tax: money,
  shipping_subtotal: money,
  shipping_discount: money,
  shipping_tax: money,
  rounding_adjustment: z.number().finite(),
});
export const originalSaleSchema = z
  .object({
    version: z.literal(1),
    policy: z.literal("pre-discount-usd-v1"),
    rounding: z.literal("half-up-order-largest-remainder-anchor"),
    refund_policy: z.literal("cumulative-proportional-gross-v1"),
    order_id: z.string(),
    order_version: z.literal(1),
    group_id: z.string(),
    cart_id: z.string(),
    seller_id: z.string(),
    currency_code: z.literal("usd"),
    allocation: z.object({
      payment_collection_id: z.string(),
      payment_session_id: z.string(),
      amount: money,
    }),
    components: componentsSchema,
    lines: z.array(
      z.object({
        id: z.string(),
        kind: z.enum(["item", "shipping"]),
        subtotal: money,
        discount: money,
        tax: money,
      }),
    ),
    commission_lines: z
      .array(
        z.object({
          item_id: z.string().nullable(),
          shipping_method_id: z.string().nullable(),
          commission_rate_id: z.string(),
          code: z.string(),
          type: z.enum(["percentage", "fixed"]),
          rate: z.number().finite().positive(),
          base: money,
          amount: money,
          unrounded_amount: z.string(),
          include_tax: z.boolean(),
          include_shipping: z.boolean(),
          rules: z.array(
            z.object({ reference: z.string(), reference_id: z.string() }),
          ),
        }),
      )
      .min(1),
    gross: money,
    commission: money,
    seller_entitlement: money,
  })
  .superRefine((sale, context) => {
    if (sale.commission <= 0) {
      context.addIssue({
        code: "custom",
        path: ["commission"],
        message: "The original sale requires a positive total commission.",
      });
    }
    const c = sale.components;
    const total = MathBN.add(
      MathBN.sub(c.merchandise_subtotal, c.merchandise_discount),
      c.merchandise_tax,
      MathBN.sub(c.shipping_subtotal, c.shipping_discount),
      c.shipping_tax,
      c.rounding_adjustment,
    );
    if (
      !MathBN.eq(total, sale.gross) ||
      !MathBN.eq(sale.allocation.amount, sale.gross) ||
      !MathBN.eq(
        MathBN.add(sale.commission, sale.seller_entitlement),
        sale.gross,
      ) ||
      !MathBN.eq(
        sale.commission_lines.reduce(
          (sum, line) => MathBN.add(sum, line.amount).toNumber(),
          0,
        ),
        sale.commission,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "The original sale does not conserve its allocation.",
      });
    }
    const sum = (
      kind: "item" | "shipping",
      field: "subtotal" | "discount" | "tax",
    ) =>
      sale.lines
        .filter((line) => line.kind === kind)
        .reduce((sum, line) => MathBN.add(sum, line[field]).toNumber(), 0);
    if (
      new Set(sale.lines.map((line) => line.id)).size !== sale.lines.length ||
      !MathBN.eq(sum("item", "subtotal"), c.merchandise_subtotal) ||
      !MathBN.eq(sum("item", "discount"), c.merchandise_discount) ||
      !MathBN.eq(sum("item", "tax"), c.merchandise_tax) ||
      !MathBN.eq(sum("shipping", "subtotal"), c.shipping_subtotal) ||
      !MathBN.eq(sum("shipping", "discount"), c.shipping_discount) ||
      !MathBN.eq(sum("shipping", "tax"), c.shipping_tax) ||
      !MathBN.eq(
        c.rounding_adjustment,
        MathBN.convert(c.rounding_adjustment).decimalPlaces(2, 4),
      ) ||
      Math.abs(c.rounding_adjustment) > (sale.lines.length * 3 + 1) * 0.005
    ) {
      context.addIssue({
        code: "custom",
        message: "The original components do not match their sale lines.",
      });
    }
    const anchors = sale.commission_lines.map(
      (line) => line.item_id ?? line.shipping_method_id,
    );
    if (
      new Set(anchors).size !== anchors.length ||
      sale.commission_lines.some(
        (line) =>
          Boolean(line.item_id) === Boolean(line.shipping_method_id) ||
          !sale.lines.some(
            (part) =>
              part.id === (line.item_id ?? line.shipping_method_id) &&
              part.kind === (line.item_id ? "item" : "shipping"),
          ) ||
          (line.type === "percentage" && line.rate > 100) ||
          (line.type === "fixed" &&
            !MathBN.eq(
              line.rate,
              MathBN.convert(line.rate).decimalPlaces(2, 4),
            )) ||
          (line.shipping_method_id !== null && !line.include_shipping),
      ) ||
      sale.lines.some(
        (line) => line.kind === "item" && !anchors.includes(line.id),
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "The commission does not match the original sale composition.",
      });
    }
  });
export type OriginalSale = z.infer<typeof originalSaleSchema>;

const originalLineSchema = z.object({
  id: z.string(),
  subtotal: decimal,
  tax_total: decimal,
  discount_total: decimal,
  discount_tax_total: decimal,
  product: z
    .object({
      id: z.string(),
      collection_id: z.string().nullable().optional(),
      type_id: z.string().nullable().optional(),
      categories: z.array(z.object({ id: z.string() })).optional(),
      tags: z.array(z.object({ id: z.string() })).optional(),
    })
    .nullable()
    .optional(),
  offer: z.object({ seller_id: z.string() }).nullable().optional(),
});
export const saleGroupSchema = z.object({
  id: z.string(),
  cart_id: z.string(),
  orders: z
    .array(
      z.object({
        id: z.string(),
        version: z.literal(1),
        currency_code: z.literal("usd"),
        total: decimal,
        seller: z.object({ id: z.string() }),
        items: z.array(originalLineSchema).min(1),
        shipping_methods: z.array(originalLineSchema),
        cart: z.object({
          id: z.string(),
          payment_collection: z.object({
            id: z.string(),
            amount: decimal,
            payment_sessions: z
              .array(z.object({ id: z.string(), status: z.string() }))
              .min(1),
          }),
        }),
      }),
    )
    .min(1)
    .max(50),
});
export type SaleGroup = z.infer<typeof saleGroupSchema>;

function round(value: z.infer<typeof decimal>): number {
  return financeAmount(MathBN.convert(value).decimalPlaces(2, 4).toNumber());
}

export function buildOriginalSale(
  group: SaleGroup,
  order: SaleGroup["orders"][number],
  resolved: ResolvedCommissionLine[],
): OriginalSale {
  const collection = order.cart.payment_collection;
  const processable = collection.payment_sessions.filter((session) =>
    [
      PaymentSessionStatus.PENDING,
      PaymentSessionStatus.REQUIRES_MORE,
      PaymentSessionStatus.AUTHORIZED,
      PaymentSessionStatus.CAPTURED,
      PaymentSessionStatus.PENDING_AUTHORIZATION,
    ].includes(session.status as PaymentSessionStatus),
  );
  if (processable.length !== 1)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "La venta requiere una sesión de pago inequívoca.",
    );
  const gross = financeAmount(order.total);
  const sourceTotal = [...order.items, ...order.shipping_methods].reduce(
    (sum, line) =>
      MathBN.add(
        sum,
        MathBN.sub(
          line.subtotal,
          MathBN.sub(line.discount_total, line.discount_tax_total),
        ),
        line.tax_total,
      ),
    MathBN.convert(0),
  );
  if (!MathBN.eq(sourceTotal.decimalPlaces(2, 4), gross))
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Los componentes originales no coinciden con el bruto de la venta.",
    );
  const lines = [
    ...order.items.map((line) => ({ ...line, kind: "item" as const })),
    ...order.shipping_methods.map((line) => ({
      ...line,
      kind: "shipping" as const,
    })),
  ].map((line) => ({
    id: line.id,
    kind: line.kind,
    subtotal: round(line.subtotal),
    discount: round(
      MathBN.sub(line.discount_total, line.discount_tax_total).toNumber(),
    ),
    tax: round(line.tax_total),
  }));
  const sum = (
    kind: "item" | "shipping",
    field: "subtotal" | "discount" | "tax",
  ) =>
    lines
      .filter((line) => line.kind === kind)
      .reduce((sum, line) => MathBN.add(sum, line[field]).toNumber(), 0);
  const components = {
    merchandise_subtotal: sum("item", "subtotal"),
    merchandise_discount: sum("item", "discount"),
    merchandise_tax: sum("item", "tax"),
    shipping_subtotal: sum("shipping", "subtotal"),
    shipping_discount: sum("shipping", "discount"),
    shipping_tax: sum("shipping", "tax"),
    rounding_adjustment: 0,
  };
  components.rounding_adjustment = MathBN.sub(
    gross,
    MathBN.add(
      MathBN.sub(
        components.merchandise_subtotal,
        components.merchandise_discount,
      ),
      components.merchandise_tax,
      MathBN.sub(components.shipping_subtotal, components.shipping_discount),
      components.shipping_tax,
    ),
  ).toNumber();
  const commission = resolved.reduce(
    (sum, entry) => MathBN.add(sum, entry.line.amount).toNumber(),
    0,
  );
  if (!MathBN.gt(commission, 0))
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "La venta requiere una comisión total positiva después del redondeo.",
    );
  if (MathBN.gt(commission, gross))
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "La comisión supera el importe repartible de esta venta.",
    );
  return originalSaleSchema.parse({
    version: 1,
    policy: "pre-discount-usd-v1",
    rounding: "half-up-order-largest-remainder-anchor",
    refund_policy: "cumulative-proportional-gross-v1",
    order_id: order.id,
    order_version: 1,
    group_id: group.id,
    cart_id: group.cart_id,
    seller_id: order.seller.id,
    currency_code: "usd",
    allocation: {
      payment_collection_id: collection.id,
      payment_session_id: processable[0].id,
      amount: gross,
    },
    components,
    lines,
    commission_lines: resolved.map(({ line, ...basis }) => ({
      ...basis,
      ...line,
      base: round(basis.base),
    })),
    gross,
    commission,
    seller_entitlement: MathBN.sub(gross, commission).toNumber(),
  });
}

export function originalAllocation(
  sales: OriginalSale[],
  paymentId: string,
): FinanceAllocation {
  return {
    payment_id: paymentId,
    currency_code: "usd",
    orders: sales.map((sale) => ({
      order_id: sale.order_id,
      amount: sale.allocation.amount,
    })),
  };
}

export function assertOriginalGroup(
  sales: OriginalSale[],
  group: {
    id: string;
    cart_id: string;
    orders: {
      id: string;
      seller: { id: string };
      cart: {
        payment_collection: { id: string; amount: z.infer<typeof decimal> };
      };
    }[];
  },
) {
  const first = group.orders[0]?.cart.payment_collection;
  if (
    !first ||
    sales.length !== group.orders.length ||
    new Set(sales.map((sale) => sale.order_id)).size !== sales.length ||
    sales.some(
      (sale) =>
        sale.group_id !== group.id ||
        sale.cart_id !== group.cart_id ||
        sale.allocation.payment_collection_id !== first.id ||
        group.orders.find((order) => order.id === sale.order_id)?.seller.id !==
          sale.seller_id,
    ) ||
    !MathBN.eq(
      sales.reduce((sum, sale) => MathBN.add(sum, sale.gross).toNumber(), 0),
      first.amount,
    )
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "El original financiero requiere conciliación del operador.",
    );
  }
}
