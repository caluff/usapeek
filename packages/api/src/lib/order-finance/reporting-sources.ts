import { z } from "@medusajs/framework/zod";
import { financeAmount } from "./policy";
import {
  providerFinanceFactSchema,
  providerFinanceCostSchema,
  providerFactCoverageSchema,
  providerFinanceObservationMetadataSchema,
  type ProviderFactsObservation,
} from "./provider-facts";
import { originalSaleSchema } from "./snapshot";

const dataKindSchema = z.enum(["ordinary", "qa_fixture", "unknown"]);
const money = z
  .number()
  .nonnegative()
  .refine((value) => {
    try {
      return financeAmount(value) === value;
    } catch {
      return false;
    }
  });

export const financeCaptureAllocationSchema = z.object({
  group_id: z.string(),
  order_id: z.string(),
  seller_id: z.string(),
  capture_fact_key: z.string().nullable(),
  status: z.enum(["confirmed", "not_captured", "unverified"]),
  effective_at: providerFinanceFactSchema.shape.effective_at,
  effective_source: z.enum(["stripe_event_created", "unknown"]),
  effective_time_status: z.enum(["verified", "unknown", "not_applicable"]),
  recorded_at: providerFinanceFactSchema.shape.recorded_at.nullable(),
  reconciled_at: providerFinanceFactSchema.shape.reconciled_at,
  currency_code: z.literal("usd"),
  data_kind: dataKindSchema,
  original: originalSaleSchema.nullable(),
  captured_amount: money.nullable(),
  merchandise_collected: money.nullable(),
  commission_recognized: money.nullable(),
  seller_entitlement_recognized: money.nullable(),
  // Components belong to the immutable sale, never to free-amount refunds.
  component_attribution: z.enum(["original_snapshot", "unknown"]),
});
export type FinanceCaptureAllocation = z.infer<
  typeof financeCaptureAllocationSchema
>;

export const financeRefundAdjustmentSchema = z.object({
  fact_key: z.string(),
  operation_id: z.string(),
  operation_state: z.string(),
  order_id: z.string(),
  seller_id: z.string(),
  amount: money,
  seller_entitlement_reduced: money,
  commission_returned: money,
  currency_code: z.literal("usd"),
  component_attribution: z.literal("unallocated"),
});
export type FinanceRefundAdjustment = z.infer<
  typeof financeRefundAdjustmentSchema
>;
export type FinanceReportingSources = ProviderFactsObservation & {
  capture_allocations: FinanceCaptureAllocation[];
  refund_adjustments: FinanceRefundAdjustment[];
};

export const sellerReportingSourcesSchema = z.object({
  facts: z.array(providerFinanceFactSchema),
  costs: z.array(providerFinanceCostSchema).max(0),
  coverage: providerFactCoverageSchema,
  capture_allocations: z.array(financeCaptureAllocationSchema),
  refund_adjustments: z.array(financeRefundAdjustmentSchema),
});

export const adminReportingSourcesSchema = z.object({
  facts: z.array(providerFinanceFactSchema).max(10_000),
  costs: z.array(providerFinanceCostSchema).max(10_000),
  coverage: providerFactCoverageSchema,
  observation: providerFinanceObservationMetadataSchema.optional(),
  capture_allocations: z.array(financeCaptureAllocationSchema).max(2_000),
  refund_adjustments: z.array(financeRefundAdjustmentSchema).max(10_000),
});
