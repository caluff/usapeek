import { isDeepStrictEqual } from "node:util";
import { performance } from "node:perf_hooks";
import type { ExecArgs } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import { COMMERCE_AUTOMATION_MODULE } from "../modules/commerce-automation";
import type CommerceAutomationService from "../modules/commerce-automation/service";
import { readOrderFinanceReportingSources } from "../lib/order-finance/record-provider-facts";
import { readAdminReportingProjection } from "../lib/order-finance/admin-reporting-projection";
import { aggregateFinanceReporting } from "../lib/order-finance/reporting";
import { resolveFinanceReportingWindow } from "../lib/order-finance/reporting-period";
import {
  FINANCE_REPORTING_PERIODS,
  type FinanceReportingQuery,
} from "../lib/order-finance/contracts";
import type { FinanceReportingSources } from "../lib/order-finance/reporting-sources";

/** Read-only parity/performance check. Emits no provider evidence or credentials. */
export default async function verifyAdminFinanceReportingRead({
  container,
}: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: users } = await query.graph({
    entity: "user",
    fields: ["id"],
    pagination: { skip: 0, take: 1 },
  });
  const actorId = z
    .array(z.object({ id: z.string().min(1) }))
    .min(1)
    .parse(users)[0].id;
  const journal = container.resolve<CommerceAutomationService>(
    COMMERCE_AUTOMATION_MODULE,
  );
  const registry = await journal.readAdminFinanceReportingRegistry();
  if (
    !registry.discovery.complete ||
    registry.truncated ||
    registry.rows.some((row) => !row.is_fresh || row.unsafe)
  )
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      "Prepare the financial reporting registry before verification.",
    );
  const { data } = await query.graph(
    {
      entity: "order_group",
      fields: ["id"],
      pagination: { skip: 0, take: 2_001, order: { id: "ASC" } },
    },
    { cache: { enable: false } },
  );
  const groups = z
    .array(z.object({ id: z.string().min(1) }))
    .max(2_000)
    .parse(data);
  if (
    !isDeepStrictEqual(
      groups.map((group) => group.id).sort(),
      registry.rows.map((row) => row.id).sort(),
    )
  )
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      "Native discovery differs from the reporting registry.",
    );
  const generatedAt = new Date();
  const sources: FinanceReportingSources[] = [];
  const started = performance.now();
  for (let offset = 0; offset < groups.length; offset += 2) {
    sources.push(
      ...(await Promise.all(
        groups.slice(offset, offset + 2).map((group) => {
          const anchor = registry.rows.find((row) => row.id === group.id)
            ?.references[0].id;
          if (!anchor)
            throw new MedusaError(
              MedusaError.Types.CONFLICT,
              "Reporting group lacks a native reference.",
            );
          return readOrderFinanceReportingSources(container, {
            order_id: anchor,
            actor_id: actorId,
          });
        }),
      )),
    );
  }
  const nativeReadMs = performance.now() - started;
  const latest = await journal.readAdminFinanceReportingRegistry();
  if (
    !isDeepStrictEqual(
      registry.rows.map((row) => [row.id, row.source_revision]),
      latest.rows.map((row) => [row.id, row.source_revision]),
    )
  )
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      "Financial sources changed during verification; repeat the read check.",
    );
  const timings: number[] = [];
  let checks = 0;
  let unknownTotals = 0;
  for (const period of FINANCE_REPORTING_PERIODS) {
    for (const dataKind of ["ordinary", "qa_fixture"] as const) {
      const filters: FinanceReportingQuery = {
        period,
        data_kind: dataKind,
        mode: "test",
        currency_code: "usd",
      };
      const expected = aggregateFinanceReporting(
        filters,
        resolveFinanceReportingWindow(period, generatedAt),
        sources,
      );
      const fastStarted = performance.now();
      const actual = await readAdminReportingProjection(container, {
        actor_id: actorId,
        query: filters,
        generated_at: generatedAt,
      });
      timings.push(performance.now() - fastStarted);
      for (const key of Object.keys(expected.report.totals) as Array<
        keyof typeof expected.report.totals
      >) {
        if (actual.report.totals[key] === null) {
          unknownTotals++;
          continue;
        }
        if (actual.report.totals[key] !== expected.report.totals[key])
          throw new MedusaError(
            MedusaError.Types.CONFLICT,
            "Verified reporting arithmetic differs from the native read.",
          );
      }
      // Native discovery and the projection registry may visit tied captures
      // in a different order; compare each sale independently of that tie.
      const canonicalSales = (sales: typeof expected.report.sales) =>
        sales
          .map((sale) => ({
            ...sale,
            order_display_id: null,
            order_custom_display_id: null,
          }))
          .sort((left, right) => left.order_id.localeCompare(right.order_id));
      const expectedSales = canonicalSales(expected.report.sales);
      const actualSales = canonicalSales(actual.report.sales);
      if (
        !isDeepStrictEqual(expectedSales, actualSales) ||
        !isDeepStrictEqual(expected.report.coverage, actual.report.coverage)
      ) {
        container.resolve(ContainerRegistrationKeys.LOGGER).error(
          JSON.stringify({
            period,
            data_kind: dataKind,
            expected_coverage: expected.report.coverage,
            actual_coverage: actual.report.coverage,
            expected_sales: expectedSales.length,
            actual_sales: actualSales.length,
            differing_sale_fields: [...new Set(expectedSales.flatMap((sale) => {
              const other = actualSales.find((candidate) => candidate.order_id === sale.order_id);
              if (!other) return ["missing_sale"];
              return Object.keys(sale).filter((key) => !isDeepStrictEqual(
                sale[key as keyof typeof sale],
                other[key as keyof typeof other],
              ));
            }))],
          }),
        );
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          "Reporting sales or coverage differs from the native read.",
        );
      }
      checks++;
    }
  }
  container.resolve(ContainerRegistrationKeys.LOGGER).info(
    JSON.stringify({
      groups: groups.length,
      parity_checks: checks,
      unknown_totals: unknownTotals,
      native_read_ms: Math.round(nativeReadMs),
      projection_min_ms: Math.round(Math.min(...timings)),
      projection_max_ms: Math.round(Math.max(...timings)),
    }),
  );
}
