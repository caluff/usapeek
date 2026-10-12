import type { VendorSettlementsResponse } from "@usapeek/api/finance-contracts";
import { DataError } from "@/features/workspace/components";
import { resultOf, workspace } from "@/features/workspace/data";
import { settlementListInput } from "./parameters";
import { SettlementAutoRefresh } from "./refresh";
import { SettlementView } from "./view";

export async function SettlementList({
  input,
}: {
  input: ReturnType<typeof settlementListInput>;
}) {
  const { client, membership } = await workspace();
  const result = await resultOf(
    client.get<VendorSettlementsResponse>(
      "/vendor/finance/settlements",
      input.query,
    ),
  );
  return (
    <div className="space-y-5">
      <SettlementAutoRefresh
        key={membership.seller.id}
        sellerId={membership.seller.id}
      />
      {result.data ? (
        <SettlementView settlements={result.data.settlements} input={input} />
      ) : (
        <DataError message={result.error} />
      )}
    </div>
  );
}
