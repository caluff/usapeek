import { isStripeLivemode } from "../lib/stripe-mode";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { MedusaContainer } from "@medusajs/framework/types";
import { MathBN, MedusaError } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { withFinanceExecutionLock } from "../lib/order-finance/execution-lock";
import { verifiedFinanceStripeClient } from "../lib/order-finance/provider";
import { readOrderFinance } from "../lib/order-finance/read";
import {
  readOrderFinanceReportingSources,
  recordOrderFinanceProviderFacts,
} from "../lib/order-finance/record-provider-facts";
import { requireFinanceOperator } from "../lib/order-finance/settlement-plan";
import {
  assertOriginalGroup,
  originalSaleSchema,
} from "../lib/order-finance/snapshot";
import { readFinanceExecutionWriters } from "../modules/commerce-automation/service";

const identifier = z
  .string()
  .min(1)
  .refine((value) => value === value.trim());
export const refreshProviderFactsInputSchema = z.strictObject({
  order_id: identifier,
  group_id: identifier,
  cart_id: identifier,
  actor_id: identifier,
  reason: z.string().trim().min(3).max(500),
});
export type RefreshProviderFactsInput = z.infer<
  typeof refreshProviderFactsInputSchema
>;
type CurrentFinance = Awaited<ReturnType<typeof readOrderFinance>>;

function requireRefresh(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, message);
}

function assertRefreshable(
  current: CurrentFinance,
  input: RefreshProviderFactsInput,
  owner?: { id: string; token?: string },
) {
  const { group, state } = current;
  requireRefresh(
    group.id === input.group_id &&
      group.cart_id === input.cart_id &&
      group.orders.some((order) => order.id === input.order_id) &&
      (!state ||
        (state.id === input.group_id && state.cart_id === input.cart_id)),
    "El pedido, grupo y carrito no coinciden con el alcance solicitado.",
  );
  requireRefresh(
    !current.financialProblem &&
      !current.originalProblem &&
      !current.hasPendingChanges,
    "La venta requiere conciliación antes de actualizar las observaciones.",
  );
  requireRefresh(
    (state?.active_token ?? null) === (owner?.token ?? null) &&
      !state?.review_required &&
      state?.observation?.finance_review == null &&
      (state?.observation?.held_order_ids == null ||
        (Array.isArray(state.observation.held_order_ids) &&
          !state.observation.held_order_ids.length)),
    "El grupo tiene un bloqueo o revisión pendiente; usa la recuperación financiera.",
  );
  const writers = readFinanceExecutionWriters(state?.observation);
  requireRefresh(
    owner
      ? writers.length === 1 &&
          writers[0].execution_owner_id === owner.id &&
          (!owner.token || writers[0].group_token === owner.token)
      : writers.length === 0,
    "Hay otro proceso financiero registrado para esta compra.",
  );
  requireRefresh(
    current.operations.every(
      (operation) =>
        operation.group_id === input.group_id && operation.state === "complete",
    ),
    "Hay operaciones financieras pendientes o inciertas; usa la recuperación financiera.",
  );
  const originals = current.originals.map((sale) =>
    originalSaleSchema.parse(sale),
  );
  assertOriginalGroup(originals, group);
  requireRefresh(
    current.original?.order_id === input.order_id,
    "Falta el original del pedido solicitado.",
  );
  const collection = group.orders[0].cart.payment_collection;
  const payment = collection.payments[0];
  requireRefresh(
    payment &&
      collection.payments.length === 1 &&
      payment.provider_id === "pp_stripe_stripe" &&
      isStripeLivemode(payment.data.livemode) &&
      payment.data.id.startsWith("pi_") &&
      MathBN.eq(payment.amount, collection.amount) &&
      group.orders.every((order) => {
        const shared = order.cart.payment_collection;
        const sale = originals.find(
          (original) => original.order_id === order.id,
        );
        return (
          order.cart.id === input.cart_id &&
          order.payment_collections.length === 0 &&
          shared.id === collection.id &&
          MathBN.eq(shared.amount, collection.amount) &&
          shared.payments.length === 1 &&
          shared.payments[0].id === payment.id &&
          shared.payments[0].data.id === payment.data.id &&
          sale?.allocation.payment_session_id === payment.payment_session_id
        );
      }),
    "La observación requiere un único pago nativo ligado a los originales.",
  );
}

function revision(current: CurrentFinance) {
  const relationNames = new Set([
    "orders",
    "items",
    "shipping_methods",
    "transactions",
    "payment_collections",
    "payments",
    "captures",
    "refunds",
    "credit_lines",
    "fulfillments",
    "operations",
    "originals",
  ]);
  function canonical(value: unknown, field = ""): unknown {
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) {
      const entries = value.map((entry) => canonical(entry));
      if (relationNames.has(field)) {
        const key = field === "originals" ? "order_id" : "id";
        const identity = (entry: unknown) =>
          entry !== null && typeof entry === "object" && key in entry
            ? String(Reflect.get(entry, key))
            : (JSON.stringify(entry) ?? "");
        entries.sort((left, right) =>
          identity(left).localeCompare(identity(right)),
        );
      }
      return entries;
    }
    if (value !== null && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, entry]) => [key, canonical(entry, key)]),
      );
    return value;
  }
  return canonical({
    group: current.group,
    originals: current.originals,
    operations: current.operations,
  });
}

async function readScope(
  container: MedusaContainer,
  input: RefreshProviderFactsInput,
  owner?: { id: string; token?: string },
) {
  const current = await readOrderFinance(
    container,
    input.order_id,
    { actor_id: input.actor_id },
    owner?.token,
  );
  assertRefreshable(current, input, owner);
  for (const order of current.group.orders) {
    if (order.id === input.order_id) continue;
    const sibling = await readOrderFinance(
      container,
      order.id,
      { actor_id: input.actor_id },
      owner?.token,
    );
    assertRefreshable(sibling, { ...input, order_id: order.id }, owner);
    requireRefresh(
      isDeepStrictEqual(revision(current), revision(sibling)),
      "La compra cambió durante la lectura del grupo.",
    );
  }
  return current;
}

export async function inspectOrderFinanceProviderFacts(
  container: MedusaContainer,
  rawInput: RefreshProviderFactsInput,
) {
  const input = refreshProviderFactsInputSchema.parse(rawInput);
  await requireFinanceOperator(container, input.actor_id);
  const current = await readScope(container, input);
  const sources = await readOrderFinanceReportingSources(container, input);
  const latest = await readScope(container, input);
  requireRefresh(
    isDeepStrictEqual(revision(current), revision(latest)),
    "La compra cambió durante la inspección.",
  );
  return {
    action: "refresh_provider_observation" as const,
    ...input,
    order_ids: current.group.orders.map((order) => order.id),
    provider_money_writes: false as const,
    executed: false as const,
    sources,
  };
}

// Supply only GET capabilities, even though the configured SDK supports money writes.
async function observationReader(): Promise<
  NonNullable<Parameters<typeof recordOrderFinanceProviderFacts>[2]>
> {
  const stripe = await verifiedFinanceStripeClient();
  return {
    paymentIntents: {
      retrieve: stripe.paymentIntents.retrieve.bind(stripe.paymentIntents),
    },
    accounts: {
      retrieveCurrent: stripe.accounts.retrieveCurrent.bind(stripe.accounts),
    },
    balance: { retrieve: stripe.balance.retrieve.bind(stripe.balance) },
    charges: { retrieve: stripe.charges.retrieve.bind(stripe.charges) },
    refunds: { list: stripe.refunds.list.bind(stripe.refunds) },
    transfers: {
      list: stripe.transfers.list.bind(stripe.transfers),
      listReversals: stripe.transfers.listReversals.bind(stripe.transfers),
    },
    events: { list: stripe.events.list.bind(stripe.events) },
    balanceTransactions: {
      retrieve: stripe.balanceTransactions.retrieve.bind(
        stripe.balanceTransactions,
      ),
    },
  };
}

export async function refreshOrderFinanceProviderFacts(
  container: MedusaContainer,
  rawInput: RefreshProviderFactsInput,
) {
  const input = refreshProviderFactsInputSchema.parse(rawInput);
  await requireFinanceOperator(container, input.actor_id);
  const initial = await readScope(container, input);
  const initialRevision = revision(initial);
  return withFinanceExecutionLock(
    container,
    { groupId: input.group_id, cartId: input.cart_id },
    async (ownerId) => {
      await requireFinanceOperator(container, input.actor_id);
      const current = await readScope(container, input, { id: ownerId });
      requireRefresh(
        isDeepStrictEqual(initialRevision, revision(current)),
        "La compra cambió antes de adquirir la exclusión.",
      );
      const attemptId = randomUUID();
      const plan = {
        action: "refresh_provider_observation",
        ...input,
        provider_money_writes: false,
      };
      // Reuse the existing durable audit used by execution-lock recovery, without
      // creating a monetary commerce_operation or claiming a recovered effect.
      const attempt = await current.journal.createFinanceRecoveryAttempts({
        id: attemptId,
        operation_id: `provider-observation:${input.group_id}:${attemptId}`,
        group_id: input.group_id,
        actor_id: input.actor_id,
        reason: input.reason,
        prior_token: "free",
        token: randomUUID(),
        prior_state: "complete",
        state: "processing",
        original_result: null,
        original_group: current.state ?? {},
        plan,
        observation: { execution_owner_id: ownerId },
      });
      let token: string | undefined;
      try {
        // Protect against automated claimGroup callers as well as manual writers.
        const claim = await current.journal.claimFinanceGroup({
          groupId: input.group_id,
          cartId: input.cart_id,
          ownerId,
        });
        requireRefresh(
          claim?.active_token,
          "El grupo dejó de estar libre antes de actualizar las observaciones.",
        );
        token = claim.active_token;
        try {
          const locked = await readScope(container, input, {
            id: ownerId,
            token,
          });
          requireRefresh(
            isDeepStrictEqual(initialRevision, revision(locked)),
            "La compra cambió antes de observar el proveedor.",
          );
          await recordOrderFinanceProviderFacts(
            container,
            {
              order_id: input.order_id,
              actor_id: input.actor_id,
              owned_token: token,
            },
            await observationReader(),
          );
          const latest = await readScope(container, input, {
            id: ownerId,
            token,
          });
          requireRefresh(
            isDeepStrictEqual(initialRevision, revision(latest)),
            "La compra cambió durante la observación del proveedor.",
          );
        } finally {
          // GET failure cannot create uncertain money. Release only our CAS token;
          // failed ownership proof leaves the durable writer/fence recoverable.
          await current.journal.releaseGroup(input.group_id, token);
        }
        // Native reporting recomputes operation/group coverage after our own
        // fence is gone. It retains provider incompleteness and any foreign hold.
        await readScope(container, input, { id: ownerId });
        const sources = await readOrderFinanceReportingSources(
          container,
          input,
        );
        const released = await readScope(container, input, { id: ownerId });
        requireRefresh(
          isDeepStrictEqual(initialRevision, revision(released)),
          "La compra cambió al releer la observación guardada.",
        );
        const result = {
          ...plan,
          attempt_id: attempt.id,
          executed: true,
          sources,
        };
        await current.journal.updateFinanceRecoveryAttempts({
          id: attempt.id,
          state: "complete",
          final_result: result,
          final_observation: {
            coverage: sources.coverage,
            observation: sources.observation ?? null,
          },
          finished_at: new Date(),
        });
        return result;
      } catch (error) {
        await current.journal.updateFinanceRecoveryAttempts({
          id: attempt.id,
          state: "interrupted",
          final_observation: {
            error: "Provider observation refresh did not complete.",
            provider_money_writes: false,
          },
          finished_at: new Date(),
        });
        throw error;
      }
    },
  );
}

const refreshOrderFinanceProviderFactsStep = createStep(
  "refresh-order-finance-provider-facts",
  async (input: RefreshProviderFactsInput, { container }) =>
    new StepResponse(await refreshOrderFinanceProviderFacts(container, input)),
);

export const refreshOrderFinanceProviderFactsWorkflow = createWorkflow(
  "refresh-order-finance-provider-facts",
  function (input: RefreshProviderFactsInput) {
    return new WorkflowResponse(refreshOrderFinanceProviderFactsStep(input));
  },
);
