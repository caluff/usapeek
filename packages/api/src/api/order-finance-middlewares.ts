import type {
  AuthenticatedMedusaRequest,
  MedusaNextFunction,
  MedusaResponse,
  MiddlewareRoute,
} from "@medusajs/framework/http";
import { validateAndTransformBody } from "@medusajs/framework/http";
import type { ILockingModule } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
  PolicyOperation,
} from "@medusajs/framework/utils";
import { COMMERCE_AUTOMATION_MODULE } from "../modules/commerce-automation";
import type CommerceAutomationService from "../modules/commerce-automation/service";
import { orderFinanceInputSchema } from "../lib/order-finance/contracts";
import { z } from "@medusajs/framework/zod";
import { guardOrderFinanceWriterWorkflow } from "../workflows/guard-order-finance-writer";
import { validateMarketplaceReturnWorkflow } from "../workflows/validate-marketplace-return";
import { invalidateOrderNotificationsWorkflow } from "../workflows/invalidate-order-notifications";
import { invalidateVendorSettlementsWorkflow } from "../workflows/invalidate-vendor-settlements";

const collectionOwnerSchema = z.object({
  id: z.string().min(1),
  cart: z.object({ id: z.string().min(1) }).nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
});
const cartLinksSchema = z
  .array(z.object({ cart_id: z.string().min(1) }))
  .max(1);

async function resolvePaymentCartId(
  req: AuthenticatedMedusaRequest,
  input: { payment_id: string } | { payment_collection_id: string },
) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  let collection: z.infer<typeof collectionOwnerSchema> | null | undefined;
  if ("payment_id" in input) {
    const { data } = await query.graph(
      {
        entity: "payment",
        fields: [
          "id",
          "payment_collection.id",
          "payment_collection.cart.id",
          "payment_collection.metadata",
        ],
        filters: { id: input.payment_id },
      },
      { cache: { enable: false } },
    );
    collection = z
      .array(
        z.object({
          id: z.literal(input.payment_id),
          payment_collection: collectionOwnerSchema.nullish(),
        }),
      )
      .max(1)
      .parse(data)[0]?.payment_collection;
  } else {
    const { data } = await query.graph(
      {
        entity: "payment_collection",
        fields: ["id", "cart.id", "metadata"],
        filters: { id: input.payment_collection_id },
      },
      { cache: { enable: false } },
    );
    collection = z
      .array(
        collectionOwnerSchema.extend({
          id: z.literal(input.payment_collection_id),
        }),
      )
      .max(1)
      .parse(data)[0];
  }
  if (!collection) return;
  let cartId = collection.cart?.id;
  if (!cartId) {
    // Split payments belong to an order rather than directly to its cart.
    const { data: links } = await query.graph(
      {
        entity: "order_payment_collection",
        fields: ["order_id"],
        filters: { payment_collection_id: collection.id },
      },
      { cache: { enable: false } },
    );
    const link = z
      .array(z.object({ order_id: z.string().min(1) }))
      .max(1)
      .parse(links)[0];
    if (link) {
      const { data: carts } = await query.graph(
        {
          entity: "order_cart",
          fields: ["cart_id"],
          filters: { order_id: link.order_id },
        },
        { cache: { enable: false } },
      );
      cartId = cartLinksSchema.parse(carts)[0]?.cart_id;
    }
  }
  const originalCollectionId = collection.metadata?.cart_payment_collection_id;
  if (originalCollectionId !== undefined) {
    const parentId = z.string().min(1).parse(originalCollectionId);
    const { data: carts } = await query.graph(
      {
        entity: "cart_payment_collection",
        fields: ["cart_id"],
        filters: { payment_collection_id: parentId },
      },
      { cache: { enable: false } },
    );
    const originalCart = cartLinksSchema.length(1).parse(carts)[0];
    if (
      parentId === collection.id ||
      (cartId && cartId !== originalCart.cart_id)
    )
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "El pago no tiene una compra original inequívoca.",
      );
    cartId = originalCart.cart_id;
  }
  return cartId;
}

export async function guardOrderFinanceWriters(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction,
) {
  let route: string;
  try {
    const rawPath = req.originalUrl.split("?")[0];
    if (/%2f|%5c/i.test(rawPath))
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Encoded path separator",
      );
    route = rawPath
      .split("/")
      .map((part, index) => {
        const decoded = decodeURIComponent(part);
        return index === 1 || index === 2 || index === 4
          ? decoded.toLowerCase()
          : decoded;
      })
      .join("/")
      .replace(/\/$/, "");
  } catch {
    next(
      new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "La ruta de la operación no es válida.",
      ),
    );
    return;
  }
  const orderMatch = route.match(
    /^\/(?:admin|vendor)\/orders\/([^/]+)(?:\/.*)?$/,
  );
  const paymentMatch = route.match(
    /^\/(?:admin|vendor)\/payments\/([^/]+)\/(capture|refund)$/,
  );
  const collectionMatch = route.match(
    /^\/(?:admin|vendor)\/payment-collections\/([^/]+)(?:\/.*)?$/,
  );
  const changeMatch = route.match(
    /^\/(?:admin|vendor)\/(returns|claims|exchanges)(?:\/([^/]+))?(?:\/.*)?$/,
  );
  const orderEditMatch = route.match(
    /^\/(?:admin|vendor)\/order-edits(?:\/([^/]+))?(?:\/.*)?$/,
  );
  if (
    (!orderMatch &&
      !paymentMatch &&
      !collectionMatch &&
      !changeMatch &&
      !orderEditMatch) ||
    route.endsWith("/finance")
  )
    return next();
  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
    let changeOrderId: string | undefined;
    if (changeMatch) {
      if (changeMatch[2]) {
        const entity = {
          returns: "return",
          claims: "order_claim",
          exchanges: "order_exchange",
        }[changeMatch[1]]!;
        const { data } = await query.graph(
          { entity, fields: ["order_id"], filters: { id: changeMatch[2] } },
          { cache: { enable: false } },
        );
        changeOrderId = z
          .object({ order_id: z.string() })
          .parse(data[0]).order_id;
      } else {
        const parsed = z.object({ order_id: z.string() }).safeParse(req.body);
        if (!parsed.success) return next();
        changeOrderId = parsed.data.order_id;
      }
    }
    let editOrderId: string | undefined;
    if (orderEditMatch) {
      // Both native APIs use the order ID in this route, not an order-change ID.
      const parsed = z
        .object({ order_id: z.string().min(1) })
        .safeParse(req.body);
      editOrderId =
        orderEditMatch[1] ??
        (parsed.success ? parsed.data.order_id : undefined);
      if (!editOrderId) return next();
    }
    const orderId = orderMatch?.[1] ?? changeOrderId ?? editOrderId;
    let cartId: string | undefined;
    if (orderId) {
      const { data: carts } = await query.graph(
        {
          entity: "order_cart",
          fields: ["cart_id"],
          filters: { order_id: orderId },
        },
        { cache: { enable: false } },
      );
      cartId = cartLinksSchema.parse(carts)[0]?.cart_id;
    } else {
      cartId = await resolvePaymentCartId(
        req,
        collectionMatch
          ? { payment_collection_id: collectionMatch[1] }
          : { payment_id: paymentMatch![1] },
      );
    }
    if (!cartId) return next();
    const { data: groups } = await query.graph(
      {
        entity: "order_group",
        fields: ["id", "orders.status"],
        filters: { cart_id: cartId },
      },
      { cache: { enable: false } },
    );
    if (!groups.length) return next();
    if (groups.length !== 1)
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "El grupo de compra requiere revisión.",
      );
    if (orderEditMatch || (changeMatch && changeMatch[1] !== "returns")) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Utiliza una devolución y el reembolso de esta tienda. Las ediciones, reclamaciones y cambios con nuevos cobros todavía no están habilitados para el pago compartido.",
      );
    }
    if (
      collectionMatch ||
      paymentMatch?.[2] === "refund" ||
      (orderMatch &&
        route === `/${route.split("/")[1]}/orders/${orderMatch[1]}/cancel`)
    ) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Utiliza Cancelaciones y reembolsos desde el detalle del pedido para aplicar el importe de esta tienda.",
      );
    }
    const locking = req.scope.resolve<ILockingModule>(Modules.LOCKING);
    await locking.execute(
      cartId,
      async () => {
        const journal = req.scope.resolve<CommerceAutomationService>(
          COMMERCE_AUTOMATION_MODULE,
        );
        const [state] = await journal.listCommerceGroupStates(
          { id: groups[0].id },
          { take: 1 },
        );
        if (
          state?.active_token ||
          state?.review_required ||
          paymentMatch?.[2] === "capture"
        ) {
          throw new MedusaError(
            MedusaError.Types.NOT_ALLOWED,
            "Utiliza el panel financiero del pedido; esta ruta no permite el cobro compartido ni omitir una conciliación pendiente.",
          );
        }
        if (changeMatch?.[1] === "returns" && orderId) {
          if (
            req.method === "POST" &&
            /\/shipping-method(?:\/[^/]+)?$/.test(route)
          ) {
            throw new MedusaError(
              MedusaError.Types.NOT_ALLOWED,
              "El transporte de devolución se coordina con la tienda; no se puede añadir otro cobro al pago compartido.",
            );
          }
          const location = z
            .object({
              location_id: z.string().optional(),
              metadata: z.unknown().optional(),
            })
            .safeParse(req.body ?? {});
          if (!location.success)
            throw new MedusaError(
              MedusaError.Types.INVALID_DATA,
              "El almacén de devolución no es válido.",
            );
          await validateMarketplaceReturnWorkflow(req.scope).run({
            input: {
              order_id: orderId,
              actor_id: req.auth_context?.actor_id ?? "",
              ...(route.startsWith("/vendor/")
                ? { seller_id: req.seller_context?.seller_id ?? "" }
                : {}),
              ...(changeMatch[2] ? { return_id: changeMatch[2] } : {}),
              location_id: location.data.location_id,
              metadata: location.data.metadata,
              confirm_request:
                req.method === "POST" && /\/request$/.test(route),
            },
          });
        }
        const writer = { group_id: groups[0].id as string, cart_id: cartId };
        const { result: token } = await guardOrderFinanceWriterWorkflow(
          req.scope,
        ).run({ input: { ...writer, action: "claim" } });
        await new Promise<void>((resolve, reject) => {
          let finalized = false;
          const complete = (action: "finish" | "disconnect") => {
            if (finalized) return;
            finalized = true;
            res.off("finish", finished);
            res.off("close", disconnected);
            void guardOrderFinanceWriterWorkflow(req.scope)
              .run({ input: { ...writer, token, action } })
              .then(async () => {
                if (changeMatch?.[1] === "returns" && orderId) {
                  await invalidateOrderNotificationsWorkflow(req.scope).run({
                    input: { order_ids: [orderId] },
                  });
                  await invalidateVendorSettlementsWorkflow(req.scope).run({
                    input: { order_ids: [orderId] },
                  });
                }
              })
              .then(() => resolve(), reject);
          };
          const finished = () => complete("finish");
          const disconnected = () => complete("disconnect");
          res.once("finish", finished);
          res.once("close", disconnected);
          next();
        });
      },
      { timeout: 5 },
    );
  } catch (error) {
    next(error);
  }
}

export const orderFinanceMiddlewares: MiddlewareRoute[] = [
  {
    matcher:
      /^\/(?:admin|vendor)\/(?:(?:orders|payments|payment-collections)\/[^/]+(?:\/.*)?|(?:returns|claims|exchanges|order-edits)(?:\/.*)?)$/i,
    method: ["POST", "DELETE"],
    middlewares: [guardOrderFinanceWriters],
  },
  {
    matcher: "/admin/orders/:id/finance",
    method: "POST",
    bodyParser: { sizeLimit: "4kb" },
    middlewares: [validateAndTransformBody(orderFinanceInputSchema)],
  },
  {
    matcher: "/vendor/orders/:id/finance",
    method: "POST",
    bodyParser: { sizeLimit: "4kb" },
    middlewares: [validateAndTransformBody(orderFinanceInputSchema)],
    policies: [
      { resource: "order", operation: PolicyOperation.update },
      { resource: "payment", operation: PolicyOperation.update },
    ],
  },
  {
    matcher: "/vendor/orders/:id/finance",
    method: "GET",
    middlewares: [],
    policies: [{ resource: "order", operation: PolicyOperation.read }],
  },
];
