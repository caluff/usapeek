import type {
  BigNumberInput,
  MedusaContainer,
} from "@medusajs/framework/types";
import { MathBN, MedusaError } from "@medusajs/framework/utils";
import { COMMERCE_AUTOMATION_MODULE } from "../../modules/commerce-automation";
import type CommerceAutomationService from "../../modules/commerce-automation/service";
import { originalSaleSchema } from "./snapshot";
import { financeAmount } from "./policy";

export async function assertOriginalPayoutEntitlement(
  container: MedusaContainer,
  input: {
    order_id: string;
    seller_id: string;
    currency_code: string;
    amount: BigNumberInput;
  },
) {
  const journal = container.resolve<CommerceAutomationService>(
    COMMERCE_AUTOMATION_MODULE,
  );
  const records = await journal.listFinanceSaleSnapshots(
    { id: input.order_id },
    { take: 1 },
  );
  const parsed = originalSaleSchema.safeParse(records[0]?.original);
  if (
    !parsed.success ||
    parsed.data.seller_id !== input.seller_id ||
    parsed.data.currency_code !== input.currency_code
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "La liquidación requiere un original financiero verificable.",
    );
  }
  const amount = financeAmount(MathBN.convert(input.amount).toNumber());
  if (amount <= 0 || !MathBN.eq(amount, parsed.data.seller_entitlement)) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "El importe de la liquidación difiere del derecho de la tienda.",
    );
  }
  const operations = await journal.listCommerceOperations(
    { group_id: parsed.data.group_id },
    { take: 1001 },
  );
  const states = await journal.listCommerceGroupStates(
    { id: parsed.data.group_id },
    { take: 1 },
  );
  if (
    operations.length > 1000 ||
    states[0]?.active_token ||
    states[0]?.review_required ||
    operations.some(
      (operation) =>
        operation.kind !== "capture" &&
        (operation.result?.order_id === input.order_id ||
          operation.kind === "payout"),
    )
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "La venta tiene ajustes u operaciones que requieren conciliación antes de liquidar.",
    );
  }
  // The ordinary native workflow does not own the durable financial plan or
  // writer fence. Manual settlement reuses its payout step after acquiring both.
  throw new MedusaError(
    MedusaError.Types.NOT_ALLOWED,
    "La liquidación requiere el plan financiero manual y su exclusión de ejecución.",
  );
}
