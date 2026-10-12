import assert from "node:assert/strict";
import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { createRemoteLinkStep } from "@medusajs/core-flows";
import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { MercurModules } from "@mercurjs/types";
import { financeStripeClient } from "../lib/order-finance/provider";

const PAYOUT = "pout_01M2BSMB0256RCSYVT888NAZMC";
const SELLER = "sel_01M1SJQH2N0X7K3TG29TEY48EC";
const ORDER = "order_01M2BSF13DED9M2EHPFEM3PVCJ";
const repairFinanceQaPayoutLinkWorkflow = createWorkflow(
  "repair-finance-qa-payout-link",
  () =>
    new WorkflowResponse(
      createRemoteLinkStep([
        {
          [MercurModules.PAYOUT]: { payout_id: PAYOUT },
          [MercurModules.SELLER]: { seller_id: SELLER },
        },
      ]),
    ),
);

/** Repair only the inspected QA setup link. Never creates or retries a transfer. */
export default async function repairFinanceQaPayoutLink({
  container,
}: ExecArgs) {
  assert.equal(process.env.NODE_ENV, "development");
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "metadata", "seller.id"],
    filters: { id: ORDER },
  });
  assert.equal(orders[0]?.metadata?.qa, "order-finance-extension-2026-09-12");
  assert.equal(orders[0]?.seller?.id, SELLER);
  const { data: payouts } = await query.graph({
    entity: "payout",
    fields: ["id", "status", "amount", "currency_code", "data"],
    filters: { id: PAYOUT },
  });
  const payout = payouts[0];
  assert.equal(payout?.status, "paid");
  assert.equal(Number(payout.amount), 10.8);
  assert.equal(payout.currency_code, "usd");
  assert.equal(payout.data?.transfer_group, ORDER);
  assert.equal(payout.data?.id, "tr_3UEyopLYDSAMFoVr0xTbO2Wz");
  const transfer = await financeStripeClient().transfers.retrieve(
    "tr_3UEyopLYDSAMFoVr0xTbO2Wz",
  );
  assert.equal(transfer.livemode, false);
  assert.equal(transfer.amount, 1080);
  assert.equal(transfer.amount_reversed, 0);
  assert.equal(transfer.transfer_group, ORDER);
  assert.equal(transfer.metadata.seller_id, SELLER);
  const { data: links } = await query.graph({
    entity: "payout_seller",
    fields: ["seller_id"],
    filters: { payout_id: PAYOUT },
  });
  assert.equal(links.length, 0, "QA link already exists; do not rerun");
  await repairFinanceQaPayoutLinkWorkflow(container).run();
  container
    .resolve(ContainerRegistrationKeys.LOGGER)
    .info(
      "QA payout seller link restored; no payment or transfer was created.",
    );
}
