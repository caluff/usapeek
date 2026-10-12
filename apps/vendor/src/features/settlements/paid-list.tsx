import type { VendorEarningsResponse } from "@usapeek/api/finance-contracts";
import { Suspense } from "react";
import { FinanceReportToolbar } from "../finance-reporting/toolbar";
import { DataError } from "../workspace/components";
import { resultOf, workspace } from "../workspace/data";
import {
  paidSettlementListInput,
  type PaidSettlementSearchParams,
} from "./paid-parameters";
import { PaidSettlementView, PaidSettlementListSkeleton } from "./paid-view";
import { SettlementAutoRefresh } from "./refresh";

export async function PaidSettlementsRegion({
  searchParams,
}: {
  searchParams: Promise<PaidSettlementSearchParams>;
}) {
  const input = paidSettlementListInput(await searchParams);
  return (
    <Suspense
      key={`${input.query.period}:${input.page}`}
      fallback={<PaidSettlementListSkeleton />}
    >
      <PaidSettlementList input={input} />
    </Suspense>
  );
}

export async function PaidSettlementsToolbar({
  searchParams,
}: {
  searchParams: Promise<PaidSettlementSearchParams>;
}) {
  const input = paidSettlementListInput(await searchParams);
  return (
    <FinanceReportToolbar
      period={input.query.period}
      basePath="/seller/settlements/paid"
      hideLabel
    />
  );
}

async function PaidSettlementList({
  input,
}: {
  input: ReturnType<typeof paidSettlementListInput>;
}) {
  const { client, membership } = await workspace();
  const result = await resultOf(
    client.get<VendorEarningsResponse>("/vendor/finance/earnings", input.query),
  );
  return (
    <>
      <SettlementAutoRefresh
        key={membership.seller.id}
        sellerId={membership.seller.id}
        eventName="finance-reporting-changed"
      />
      {result.data ? (
        <PaidSettlementView earnings={result.data.earnings} input={input} />
      ) : (
        <DataError message={result.error} />
      )}
    </>
  );
}
