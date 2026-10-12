import { z } from "@medusajs/framework/zod";

export const paymentCaptureModeSchema = z.enum(["manual", "automatic"]);
export const updatePaymentCaptureSettingsSchema = z.strictObject({
  mode: paymentCaptureModeSchema,
  expected_revision: z.string().min(1).max(64),
});
export type UpdatePaymentCaptureSettings = z.infer<
  typeof updatePaymentCaptureSettingsSchema
>;
export const paymentCaptureSettingsResponseSchema = z.strictObject({
  settings: z.strictObject({
    mode: paymentCaptureModeSchema,
    revision: z.string(),
  }),
});
export type PaymentCaptureSettingsResponse = z.infer<
  typeof paymentCaptureSettingsResponseSchema
>;

export const paymentReleaseModeSchema = z.enum(["manual", "automatic"]);
export const DEFAULT_PAYMENT_RELEASE_DELAY_DAYS = 3;
export const paymentReleaseDelayDaysSchema = z.number().int().min(0).max(365);
export const updatePaymentReleaseSettingsSchema = z.strictObject({
  mode: paymentReleaseModeSchema,
  delay_days: paymentReleaseDelayDaysSchema,
  expected_revision: z.string().min(1).max(64),
});
export type UpdatePaymentReleaseSettings = z.infer<
  typeof updatePaymentReleaseSettingsSchema
>;
export const paymentReleaseSettingsResponseSchema = z.strictObject({
  settings: z.strictObject({
    mode: paymentReleaseModeSchema,
    delay_days: paymentReleaseDelayDaysSchema,
    revision: z.string(),
  }),
  automatic_available: z.boolean(),
});
export type PaymentReleaseSettingsResponse = z.infer<
  typeof paymentReleaseSettingsResponseSchema
>;

export const FINANCE_REPORTING_PERIODS = [
  "today",
  "last_7_days",
  "last_30_days",
  "current_month",
] as const;

export type FinanceReportingPeriod = (typeof FINANCE_REPORTING_PERIODS)[number];

export const financeReportingQuerySchema = z
  .object({
    period: z.enum(FINANCE_REPORTING_PERIODS),
    mode: z.literal("test"),
    currency_code: z.literal("usd"),
    data_kind: z.enum(["ordinary", "qa_fixture"]),
  })
  .strict();

export type FinanceReportingQuery = z.infer<typeof financeReportingQuerySchema>;

export type FinanceReportingSale = {
  order_id: string;
  order_display_id: number | null;
  order_custom_display_id: string | null;
  capture_status: "confirmed" | "not_captured" | "unknown";
  captured_at: string | null;
  captured_amount: number | null;
  captured_in_period: number;
  merchandise_collected: number | null;
  merchandise_collected_in_period: number;
  refunds_effective: number;
  refund_component_attribution: "unallocated" | "unknown";
  gross_commission: number | null;
  commission_recognized_in_period: number;
  commission_reversed: number;
  net_commission: number | null;
  seller_earnings: number | null;
  transfers_gross: number;
  transfer_reversals: number;
  transferred_net: number;
  transfers_gross_to_cutoff: number;
  transfer_reversals_to_cutoff: number;
  transferred_net_to_cutoff: number;
  pending_settlement: number | null;
  coverage: "complete" | "partial";
};

export type FinanceReportingResponse = {
  report: {
    filters: FinanceReportingQuery;
    window: {
      time_zone: string;
      start_at: string;
      end_at: string;
      cutoff_at: string;
      generated_at: string;
    };
    totals: {
      captured_volume: number;
      merchandise_gmv: number;
      paid_vendor_orders: number;
      refunds_effective: number;
      net_captured_volume: number;
      gross_marketplace_commission: number;
      commission_reversed: number;
      net_marketplace_commission: number;
      result_after_fees: number | null;
      vendor_earnings: number;
      transfers_gross: number;
      transfer_reversals: number;
      transfers_net: number;
      pending_settlement: number;
      confirmed_stripe_fees: number | null;
    };
    coverage: {
      complete: boolean;
      partial_reasons: Array<{ reason: string; count: number }>;
      excluded_unknown_data_kind: number;
      excluded_unknown_effective_time: number;
      pending_or_unavailable_fees: number;
      sales_truncated: boolean;
    };
    sales: FinanceReportingSale[];
  };
};

export type AdminFinanceReportingResponse = {
  report: Omit<FinanceReportingResponse["report"], "totals"> & {
    totals: {
      [Key in keyof FinanceReportingResponse["report"]["totals"]]:
        FinanceReportingResponse["report"]["totals"][Key] | null;
    };
    freshness: {
      refreshed_at: string | null;
      pending_groups: number;
      discovery_complete: boolean;
    };
    pending_settlements: {
      stores: Array<{
        seller_id: string;
        seller_name: string | null;
        amount: number;
      }>;
      complete: boolean;
    } | null;
  };
};

export type VendorFinanceReportingResponse = {
  report: Omit<FinanceReportingResponse["report"], "totals"> & {
    totals: {
      [Key in keyof FinanceReportingResponse["report"]["totals"]]:
        FinanceReportingResponse["report"]["totals"][Key] | null;
    };
    freshness: {
      refreshed_at: string | null;
      pending_orders: number;
      discovery_complete: boolean;
    };
  };
};

export const vendorEarningsQuerySchema = financeReportingQuerySchema.extend({
  period: z.enum(FINANCE_REPORTING_PERIODS).default("last_30_days"),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  offset: z.coerce.number().int().nonnegative().safe().default(0),
});
export type VendorEarningsQuery = z.infer<typeof vendorEarningsQuerySchema>;

export type VendorEarningItem = {
  order_id: string;
  order_display_id: number | null;
  order_custom_display_id: string | null;
  captured_at: string | null;
  captured_amount: number;
  refunded_amount: number;
  total_amount: number | null;
  commission_amount: number | null;
  net_amount: number | null;
  coverage: "complete" | "partial";
};

export type VendorEarningsResponse = {
  earnings: {
    filters: FinanceReportingQuery;
    window: VendorFinanceReportingResponse["report"]["window"];
    coverage: VendorFinanceReportingResponse["report"]["coverage"];
    freshness: VendorFinanceReportingResponse["report"]["freshness"];
    total_amount: number | null;
    total_commission: number | null;
    total_net: number | null;
    count: number;
    limit: number;
    offset: number;
    items: VendorEarningItem[];
  };
};

export const vendorSettlementsQuerySchema = z.strictObject({
  mode: z.literal("test"),
  currency_code: z.literal("usd"),
  data_kind: z.enum(["ordinary", "qa_fixture"]),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  offset: z.coerce.number().int().nonnegative().safe().default(0),
});

export type VendorSettlementsQuery = z.infer<
  typeof vendorSettlementsQuerySchema
>;

export type VendorSettlementItem = {
  order_id: string;
  order_display_id: number | null;
  order_custom_display_id: string | null;
  pending_amount: number | null;
  completed_at: string;
  eligible_at: string;
  status: "waiting" | "due" | "processing" | "needs_review";
  reason: string | null;
  updated_at: string | null;
};

export type VendorSettlementsResponse = {
  settlements: {
    mode: "test";
    currency_code: "usd";
    data_kind: "ordinary" | "qa_fixture";
    automatic_enabled: boolean;
    generated_at: string;
    time_zone: string;
    total_pending: number | null;
    next_release_at: string | null;
    unknown_amount_count: number;
    count: number;
    limit: number;
    offset: number;
    items: VendorSettlementItem[];
  };
};

export const orderFinanceInputSchema = z
  .object({
    action: z.enum(["cancel", "refund", "capture"]),
    amount: z.number().finite().positive().optional(),
    note: z.string().trim().min(3).max(500),
    request_id: z.uuid(),
    confirm: z.literal(true),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.action === "refund" && input.amount === undefined) {
      context.addIssue({
        code: "custom",
        path: ["amount"],
        message: "Indica el importe del reembolso.",
      });
    }
    if (input.action !== "refund" && input.amount !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["amount"],
        message: "El importe de esta operación lo calcula el servidor.",
      });
    }
  });

export type OrderFinanceInput = z.infer<typeof orderFinanceInputSchema>;

export const storeOrderCancellationInputSchema = z.strictObject({
  note: orderFinanceInputSchema.shape.note,
  request_id: orderFinanceInputSchema.shape.request_id,
  confirm: orderFinanceInputSchema.shape.confirm,
});
export type StoreOrderCancellationInput = z.infer<
  typeof storeOrderCancellationInputSchema
>;
export type StoreOrderCancellationResponse = {
  cancellation: { allowed: boolean; reason: string | null };
  canceled?: true;
};

export const customerReturnInputSchema = z.strictObject({
  request_id: z.uuid(),
  reason: z.enum(["damaged", "wrong_item"]),
  note: z.string().trim().min(3).max(500),
  items: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        quantity: z.number().int().positive().max(999),
      }),
    )
    .min(1)
    .max(100)
    .refine(
      (items) => new Set(items.map((item) => item.id)).size === items.length,
      "No repitas un artículo.",
    ),
  confirm: z.literal(true),
});
export type CustomerReturnInput = z.infer<typeof customerReturnInputSchema>;
export type CustomerReturnsResponse = {
  eligibility: { allowed: boolean; reason: string | null };
  items: Array<{ id: string; title: string; available_quantity: number }>;
  requests: Array<{
    id: string;
    status:
      "pending" | "approved" | "partially_received" | "received" | "canceled";
    reason: "damaged" | "wrong_item" | "store_return";
    note: string;
    destination: string | null;
  }>;
};

export type OrderFinanceResponse = {
  finance: {
    order_id: string;
    currency_code: string;
    allocated_total: number;
    refunded_total: number;
    refundable_total: number;
    captured_total: number;
    capture: { allowed: boolean; reason: string | null; amount: number };
    cancellation: {
      allowed: boolean;
      reason: string | null;
      refund_amount: number;
    };
    refund: { allowed: boolean; reason: string | null };
    history: Array<{
      id: string;
      kind: "cancel" | "refund" | "capture";
      amount: number;
      status: "processing" | "complete" | "uncertain";
      note: string;
      created_at: string;
      seller_reversed?: number;
      seller_entitlement_reduced?: number;
      commission_returned?: number;
    }>;
  };
};
