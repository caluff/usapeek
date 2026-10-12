import type { MedusaContainer } from "@medusajs/framework/types";
import { MathBN } from "@medusajs/framework/utils";
import {
  vendorEarningsQuerySchema,
  type VendorEarningsQuery,
  type VendorEarningsResponse,
} from "./contracts";
import { readVendorFinanceReporting } from "./vendor-reporting-projection";

/** Uses the same verified seller projection and period arithmetic as Tus ganancias. */
export async function readVendorEarnings(
  container: MedusaContainer,
  input: {
    actor_id: string;
    seller_id: string;
    query: VendorEarningsQuery;
    generated_at?: Date;
  },
): Promise<VendorEarningsResponse> {
  const { limit, offset, ...query } = vendorEarningsQuerySchema.parse(
    input.query,
  );
  const { report } = await readVendorFinanceReporting(container, {
    ...input,
    query,
  });
  // A transfer alone does not constitute a new sale. Refunds of older captured
  // orders remain visible as adjustments, matching the period's earnings card.
  const sales = report.sales
    .filter(
      (sale) =>
        sale.capture_status === "confirmed" &&
        (sale.captured_in_period > 0 ||
          sale.refunds_effective > 0 ||
          (sale.net_commission !== null && sale.net_commission !== 0) ||
          (sale.seller_earnings !== null && sale.seller_earnings !== 0)),
    )
    .sort(
      (left, right) =>
        (right.captured_at ?? "").localeCompare(left.captured_at ?? "") ||
        left.order_id.localeCompare(right.order_id),
    );
  return {
    earnings: {
      filters: report.filters,
      window: report.window,
      coverage: report.coverage,
      freshness: report.freshness,
      total_amount: report.totals.net_captured_volume,
      total_commission: report.totals.net_marketplace_commission,
      total_net: report.totals.vendor_earnings,
      count: sales.length,
      limit,
      offset,
      items: sales.slice(offset, offset + limit).map((sale) => ({
        order_id: sale.order_id,
        order_display_id: sale.order_display_id,
        order_custom_display_id: sale.order_custom_display_id,
        captured_at: sale.captured_at,
        captured_amount: sale.captured_in_period,
        refunded_amount: sale.refunds_effective,
        total_amount:
          sale.coverage === "complete"
            ? MathBN.sub(
                sale.captured_in_period,
                sale.refunds_effective,
              ).toNumber()
            : null,
        commission_amount:
          sale.coverage === "complete" ? sale.net_commission : null,
        net_amount: sale.coverage === "complete" ? sale.seller_earnings : null,
        coverage: sale.coverage,
      })),
    },
  };
}
