import type {
  IPaymentProvider,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  CreateAccountHolderInput,
  CreateAccountHolderOutput,
  UpdateAccountHolderInput,
  UpdateAccountHolderOutput,
  DeleteAccountHolderInput,
  DeleteAccountHolderOutput,
  SavePaymentMethodInput,
  SavePaymentMethodOutput,
  DeletePaymentMethodInput,
  DeletePaymentMethodOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types";
import { MathBN, MedusaError, PaymentActions } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import nativeStripeModule from "@medusajs/medusa/payment-stripe";
import type Stripe from "stripe";
import {
  assertStripePlatformAccount,
  getStripeApiKeyMode,
  getStripeMode,
  isStripeLivemode,
} from "../../lib/stripe-mode";

export const FINAL_CAPTURE_OPERATION_METADATA =
  "marketplace_final_capture_operation_id";

const RESERVED_INITIATION_METADATA = [
  FINAL_CAPTURE_OPERATION_METADATA,
  "finance_operation_id",
  "order_id",
  "stripe_refund_id",
  "finance_recovery_mode",
];

// The installed module exports its provider constructors, but not their types.
// This boundary describes the native signature-verification method we reuse.
interface NativeStripeProvider extends IPaymentProvider {
  createAccountHolder(
    input: CreateAccountHolderInput,
  ): Promise<CreateAccountHolderOutput>;
  updateAccountHolder(
    input: UpdateAccountHolderInput,
  ): Promise<UpdateAccountHolderOutput>;
  deleteAccountHolder(
    input: DeleteAccountHolderInput,
  ): Promise<DeleteAccountHolderOutput>;
  savePaymentMethod(
    input: SavePaymentMethodInput,
  ): Promise<SavePaymentMethodOutput>;
  deletePaymentMethod(
    input: DeletePaymentMethodInput,
  ): Promise<DeletePaymentMethodOutput>;
  constructWebhookEvent(data: ProviderWebhookPayload["payload"]): Stripe.Event;
  stripe_: Stripe;
  readonly options: { apiKey: string };
}
type NativeStripeConstructor = {
  new (
    container: Record<string, unknown>,
    options: Record<string, unknown>,
  ): NativeStripeProvider;
  identifier: string;
};

const nativeService = nativeStripeModule.services.find(
  (service) => "identifier" in service && service.identifier === "stripe",
);
if (!nativeService)
  throw new MedusaError(
    MedusaError.Types.UNEXPECTED_STATE,
    "The native Stripe payment provider is unavailable.",
  );
export const NativeStripeService = nativeService as NativeStripeConstructor;

const refundMetadataSchema = z.object({
  finance_operation_id: z
    .string()
    .min(1)
    .max(200)
    .refine((id) => id === id.trim()),
  order_id: z
    .string()
    .min(1)
    .refine((id) => id === id.trim()),
  finance_recovery_mode: z.literal("adopt_only").optional(),
  stripe_refund_id: z.string().startsWith("re_").optional(),
});

function refundReconciliationError() {
  return new MedusaError(
    MedusaError.Types.NOT_ALLOWED,
    "El reembolso requiere conciliación antes de continuar.",
  );
}

function stripeReference(value: string | { id: string } | null) {
  return typeof value === "string" ? value : value?.id;
}

export function financeCheckoutDataKind(
  apiKey: string,
  environment: NodeJS.ProcessEnv = process.env,
): "ordinary" | "qa_fixture" {
  const kind = environment.FINANCE_CHECKOUT_DATA_KIND;
  if (kind === undefined || kind === "ordinary") return "ordinary";
  let database: URL | undefined;
  try {
    database = new URL(environment.DATABASE_URL ?? "");
  } catch {
    /* Missing/invalid database context is not a fixture environment. */
  }
  if (
    kind !== "qa_fixture" ||
    environment.NODE_ENV !== "test" ||
    !/^sk_test_[A-Za-z0-9]+$/.test(apiKey) ||
    !database ||
    !["postgres:", "postgresql:"].includes(database.protocol) ||
    !["localhost", "127.0.0.1"].includes(database.hostname) ||
    database.port !== "55432" ||
    database.username !== "closure_test" ||
    database.search !== "" ||
    database.hash !== "" ||
    !/^\/(closure_[a-z0-9_]+|commerce_regression_[a-z0-9_]+)$/.test(
      database.pathname,
    ) ||
    environment.PGSSLMODE !== "require" ||
    environment.STRIPE_AUTOMATIC_JOBS_ENABLED !== "false"
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Finance fixture classification requires the isolated local TEST environment.",
    );
  }
  return "qa_fixture";
}

export default class StripeAllocatedPaymentService extends NativeStripeService {
  static identifier = "stripe";

  private stripeMode() {
    const mode = getStripeApiKeyMode(this.options.apiKey);
    if (
      mode !== getStripeMode() ||
      (mode === "live" && process.env.STRIPE_LIVE_ENABLED !== "true")
    )
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "The Stripe payment provider is disabled or belongs to another mode.",
      );
    return mode;
  }

  private async verifyPlatform() {
    if (this.stripeMode() !== "live" && !process.env.STRIPE_ACCOUNT_ID?.trim())
      return;
    const platform = await this.stripe_.accounts.retrieveCurrent();
    assertStripePlatformAccount(platform.id);
  }

  private assertPaymentMode(data: Record<string, unknown> | undefined) {
    // Preserve native indeterminate responses, which do not contain an intent.
    if (
      data &&
      "livemode" in data &&
      !isStripeLivemode(data.livemode, this.stripeMode())
    )
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "The Stripe payment belongs to another mode.",
      );
  }

  override async createAccountHolder(
    input: CreateAccountHolderInput,
  ): Promise<CreateAccountHolderOutput> {
    await this.verifyPlatform();
    return super.createAccountHolder(input);
  }

  override async updateAccountHolder(
    input: UpdateAccountHolderInput,
  ): Promise<UpdateAccountHolderOutput> {
    await this.verifyPlatform();
    return super.updateAccountHolder(input);
  }

  override async deleteAccountHolder(
    input: DeleteAccountHolderInput,
  ): Promise<DeleteAccountHolderOutput> {
    await this.verifyPlatform();
    return super.deleteAccountHolder(input);
  }

  override async savePaymentMethod(
    input: SavePaymentMethodInput,
  ): Promise<SavePaymentMethodOutput> {
    await this.verifyPlatform();
    return super.savePaymentMethod(input);
  }

  override async deletePaymentMethod(
    input: DeletePaymentMethodInput,
  ): Promise<DeletePaymentMethodOutput> {
    await this.verifyPlatform();
    return super.deletePaymentMethod(input);
  }

  override async capturePayment(
    input: CapturePaymentInput,
  ): Promise<CapturePaymentOutput> {
    await this.verifyPlatform();
    this.assertPaymentMode(input.data);
    const result = await super.capturePayment(input);
    this.assertPaymentMode(result.data);
    return result;
  }

  override async cancelPayment(
    input: CancelPaymentInput,
  ): Promise<CancelPaymentOutput> {
    await this.verifyPlatform();
    this.assertPaymentMode(input.data);
    const result = await super.cancelPayment(input);
    this.assertPaymentMode(result.data);
    return result;
  }

  override async updatePayment(
    input: UpdatePaymentInput,
  ): Promise<UpdatePaymentOutput> {
    await this.verifyPlatform();
    this.assertPaymentMode(input.data);
    const result = await super.updatePayment(input);
    this.assertPaymentMode(result.data);
    return result;
  }

  override async initiatePayment(
    input: InitiatePaymentInput,
  ): Promise<InitiatePaymentOutput> {
    if (
      input.data?.capture_method !== undefined &&
      input.data.capture_method !== "manual"
    ) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Checkout requires manual capture.",
      );
    }
    const kind = financeCheckoutDataKind(this.options.apiKey);
    const metadata = z
      .record(z.string(), z.unknown())
      .parse(input.data?.metadata ?? {});
    if (
      RESERVED_INITIATION_METADATA.some((field) =>
        Object.prototype.hasOwnProperty.call(metadata, field),
      )
    ) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Checkout metadata contains a reserved finance field.",
      );
    }
    // Capture mode and classification are owned by the server. Native initiation
    // preserves session ID, provider normalization, retries and status handling.
    await this.verifyPlatform();
    const result = await super.initiatePayment({
      ...input,
      data: {
        ...input.data,
        capture_method: "manual",
        metadata: { ...metadata, finance_data_kind: kind },
      },
    });
    this.assertPaymentMode(result.data);
    return result;
  }

  override async refundPayment(
    input: RefundPaymentInput,
  ): Promise<RefundPaymentOutput> {
    await this.verifyPlatform();
    this.assertPaymentMode(input.data);
    // The payment-module patch transports persisted Refund metadata separately
    // from provider data, retaining the native refund ID as its idempotency key.
    const context = z
      .object({ refund_metadata: z.unknown().optional() })
      .parse(input.context ?? {});
    const metadata = context.refund_metadata;
    if (
      !metadata ||
      typeof metadata !== "object" ||
      !(
        "finance_operation_id" in metadata ||
        "finance_recovery_mode" in metadata ||
        "stripe_refund_id" in metadata
      )
    ) {
      return super.refundPayment(input);
    }
    const parsed = refundMetadataSchema.safeParse(metadata);
    if (!parsed.success) {
      throw refundReconciliationError();
    }
    const financial = parsed.data;
    const intentId = input.data?.id;
    const amount = MathBN.mult(input.amount, 100).toNumber();
    if (
      typeof intentId !== "string" ||
      !intentId.startsWith("pi_") ||
      !Number.isSafeInteger(amount) ||
      amount <= 0
    ) {
      throw refundReconciliationError();
    }
    const intent = await this.stripe_.paymentIntents.retrieve(intentId);
    const chargeId = stripeReference(intent.latest_charge);
    if (
      intent.id !== intentId ||
      !isStripeLivemode(intent.livemode, this.stripeMode()) ||
      intent.currency !== "usd" ||
      intent.status !== "succeeded" ||
      !chargeId ||
      intent.amount_received < amount
    ) {
      throw refundReconciliationError();
    }
    const charge = await this.stripe_.charges.retrieve(chargeId);
    if (
      charge.id !== chargeId ||
      !isStripeLivemode(charge.livemode, this.stripeMode()) ||
      !charge.paid ||
      !charge.captured ||
      charge.status !== "succeeded" ||
      charge.currency !== "usd" ||
      stripeReference(charge.payment_intent) !== intentId ||
      charge.amount_captured < amount
    ) {
      throw refundReconciliationError();
    }
    const candidates: Stripe.Refund[] = [];
    const seen = new Set<string>();
    let startingAfter: string | undefined;
    // Exhaust every page before deciding that an operation has no external effect.
    for (;;) {
      const page = await this.stripe_.refunds.list({
        payment_intent: intentId,
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
      for (const refund of page.data) {
        if (seen.has(refund.id)) throw refundReconciliationError();
        seen.add(refund.id);
        if (
          refund.metadata?.finance_operation_id ===
          financial.finance_operation_id
        ) {
          candidates.push(refund);
        }
      }
      if (!page.has_more) break;
      startingAfter = page.data[page.data.length - 1]?.id;
      if (!startingAfter) throw refundReconciliationError();
    }
    if (candidates.length > 1) throw refundReconciliationError();
    let refund = candidates[0];
    if (!refund) {
      if (
        financial.finance_recovery_mode === "adopt_only" ||
        financial.stripe_refund_id
      ) {
        throw refundReconciliationError();
      }
      // The metadata and key survive deletion of a provisional native Refund on
      // provider failure. Do not include its transient ID in Stripe parameters.
      refund = await this.stripe_.refunds.create(
        {
          payment_intent: intentId,
          amount,
          metadata: {
            finance_operation_id: financial.finance_operation_id,
            order_id: financial.order_id,
          },
        },
        { idempotencyKey: `finance-refund:${financial.finance_operation_id}` },
      );
    } else {
      refund = await this.stripe_.refunds.retrieve(refund.id);
    }
    if (
      refund.status !== "succeeded" ||
      refund.amount !== amount ||
      refund.currency !== "usd" ||
      refund.reason === "expired_uncaptured_charge" ||
      stripeReference(refund.payment_intent) !== intentId ||
      stripeReference(refund.charge) !== chargeId ||
      refund.metadata?.finance_operation_id !==
        financial.finance_operation_id ||
      refund.metadata?.order_id !== financial.order_id ||
      (financial.stripe_refund_id && refund.id !== financial.stripe_refund_id)
    ) {
      throw refundReconciliationError();
    }
    return {
      data: {
        ...input.data,
        marketplace_refund: {
          id: refund.id,
          finance_operation_id: financial.finance_operation_id,
          order_id: financial.order_id,
          amount: refund.amount,
          currency: refund.currency,
          created: refund.created,
          status: refund.status,
        },
      },
    };
  }

  override async getWebhookActionAndData(
    webhookData: ProviderWebhookPayload["payload"],
  ): Promise<WebhookActionResult> {
    const event = this.constructWebhookEvent(webhookData);
    const mode = this.stripeMode();
    const object = event.data.object;
    if (
      !isStripeLivemode(event.livemode, mode) ||
      ("livemode" in object && !isStripeLivemode(object.livemode, mode)) ||
      (event.type.startsWith("payment_intent.") && !("livemode" in object))
    )
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "The Stripe webhook mode does not match this payment provider.",
      );
    if (event.type === "payment_intent.succeeded") {
      const intent = event.data.object;
      const operationId = intent.metadata?.[FINAL_CAPTURE_OPERATION_METADATA];
      if (
        isStripeLivemode(intent.livemode, mode) &&
        intent.status === "succeeded" &&
        typeof operationId === "string" &&
        operationId.trim().length > 0
      ) {
        // The durable finance operation owns native capture bookkeeping. Replaying
        // this webhook would create another capture for a final partial capture.
        return { action: PaymentActions.NOT_SUPPORTED };
      }
    }
    return super.getWebhookActionAndData(webhookData);
  }
}
