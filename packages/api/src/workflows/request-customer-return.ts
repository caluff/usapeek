import { createHash } from "node:crypto";
import {
  beginReturnOrderWorkflow,
  emitEventStep,
  requestItemReturnWorkflow,
} from "@medusajs/core-flows";
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import {
  customerReturnInputSchema,
  type CustomerReturnInput,
} from "../lib/order-finance/contracts";
import {
  customerReturnMetadataSchema,
  readCustomerReturns,
} from "../lib/order-finance/returns";
import { withFinanceExecutionLock } from "../lib/order-finance/execution-lock";
import { readOrderFinance } from "../lib/order-finance/read";
import { guardOrderFinanceWriterWorkflow } from "./guard-order-finance-writer";

type Input = CustomerReturnInput & { order_id: string; customer_id: string };
const createCustomerNativeReturnWorkflow = createWorkflow(
  "create-customer-native-return",
  function (input: Input & { fingerprint: string }) {
    const change = beginReturnOrderWorkflow.runAsStep({
      input: {
        order_id: input.order_id,
        created_by: input.customer_id,
        description: input.note,
        metadata: transform({ input }, ({ input }) => ({
          usapeek_customer_return: {
            request_id: input.request_id,
            customer_id: input.customer_id,
            fingerprint: input.fingerprint,
            reason: input.reason,
            note: input.note,
            items: input.items,
            confirm: true,
          },
        })),
      },
    });
    const result = requestItemReturnWorkflow.runAsStep({
      input: {
        return_id: change.return_id!,
        items: input.items,
      },
    });
    emitEventStep({
      eventName: "order.customer_return_requested",
      data: transform({ result, input }, ({ input }) => ({
        order_id: input.order_id,
      })),
    });
    return new WorkflowResponse(result);
  },
);

const requestCustomerReturnStep = createStep(
  "request-customer-return",
  async (input: Input, { container }) => {
    const body = customerReturnInputSchema.parse({
      request_id: input.request_id,
      reason: input.reason,
      note: input.note,
      items: input.items,
      confirm: input.confirm,
    });
    const current = await readOrderFinance(container, input.order_id, {
      actor_id: input.customer_id,
      customer_id: input.customer_id,
    });
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          order_id: input.order_id,
          customer_id: input.customer_id,
          reason: body.reason,
          note: body.note,
          items: [...body.items].sort((a, b) => a.id.localeCompare(b.id)),
        }),
      )
      .digest("hex");
    const response = await withFinanceExecutionLock(
      container,
      { groupId: current.group.id, cartId: current.group.cart_id },
      async () => {
        const query = container.resolve(ContainerRegistrationKeys.QUERY);
        const { data: existing } = await query.graph(
          {
            entity: "return",
            fields: ["id", "metadata"],
            filters: { order_id: input.order_id },
            pagination: { take: 101 },
            withDeleted: true,
          },
          { cache: { enable: false } },
        );
        if (existing.length > 100)
          throw new MedusaError(
            MedusaError.Types.NOT_ALLOWED,
            "El pedido requiere revisión.",
          );
        const repeated = existing.filter((entry) => {
          const metadata = customerReturnMetadataSchema.safeParse(
            entry.metadata?.usapeek_customer_return,
          );
          return (
            metadata.success && metadata.data.request_id === body.request_id
          );
        });
        if (repeated.length) {
          const metadata = customerReturnMetadataSchema.parse(
            repeated[0].metadata?.usapeek_customer_return,
          );
          if (
            repeated.length !== 1 ||
            metadata.fingerprint !== fingerprint ||
            metadata.customer_id !== input.customer_id
          ) {
            throw new MedusaError(
              MedusaError.Types.INVALID_DATA,
              "La solicitud ya se utilizó con otros datos.",
            );
          }
          return await readCustomerReturns(
            container,
            input.order_id,
            input.customer_id,
          );
        }
        const state = await readCustomerReturns(
          container,
          input.order_id,
          input.customer_id,
        );
        if (!state.eligibility.allowed)
          throw new MedusaError(
            MedusaError.Types.NOT_ALLOWED,
            state.eligibility.reason!,
          );
        if (
          body.items.some(
            (item) =>
              item.quantity >
              (state.items.find((line) => line.id === item.id)
                ?.available_quantity ?? 0),
          )
        ) {
          throw new MedusaError(
            MedusaError.Types.INVALID_DATA,
            "Revisa los artículos y las cantidades disponibles.",
          );
        }
        const writer = {
          group_id: current.group.id,
          cart_id: current.group.cart_id,
        };
        const { result: token } = await guardOrderFinanceWriterWorkflow(
          container,
        ).run({ input: { ...writer, action: "claim" } });
        try {
          await createCustomerNativeReturnWorkflow(container).run({
            input: {
              ...body,
              order_id: input.order_id,
              customer_id: input.customer_id,
              fingerprint,
            },
          });
          const result = await readCustomerReturns(
            container,
            input.order_id,
            input.customer_id,
            token,
          );
          await guardOrderFinanceWriterWorkflow(container).run({
            input: { ...writer, token, action: "finish" },
          });
          return result;
        } catch (error) {
          await guardOrderFinanceWriterWorkflow(container).run({
            input: { ...writer, token, action: "disconnect" },
          });
          throw error;
        }
      },
    );
    return new StepResponse(response);
  },
);
export const requestCustomerReturnWorkflow = createWorkflow(
  "request-customer-return",
  function (input: Input) {
    return new WorkflowResponse(requestCustomerReturnStep(input));
  },
);
