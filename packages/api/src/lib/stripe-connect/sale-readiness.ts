import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import { PayoutAccountStatus, SellerStatus } from "@mercurjs/types";
import { getStripeConnectConfiguration } from "../stripe-connect-configuration";

const stripeAccountData = z.object({
  id: z.string().startsWith("acct_").min(6),
  country: z.literal("US"),
  metadata: z.object({ account_id: z.string().min(1) }),
});

function unavailable(): never {
  throw new MedusaError(
    MedusaError.Types.NOT_ALLOWED,
    "One or more sellers have not completed Stripe setup for this purchase.",
  );
}

/** Call from the native completion validate hook; catalog preparation stays independent. */
export async function assertCartSellersReadyForSale(
  container: MedusaContainer, cartId: string, options: { allowCompleted?: boolean } = {},
): Promise<void> {
  if (!cartId?.trim()) throw new MedusaError(MedusaError.Types.INVALID_DATA, "A cart is required.");
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: carts } = await query.graph({
    entity: "cart",
    fields: ["id", "completed_at", "currency_code", "shipping_address.country_code", "items.id", "items.offer.seller_id"],
    filters: { id: cartId },
  }, { cache: { enable: false } });
  const cart = carts[0];
  if (!cart || cart.id !== cartId) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Cart not found.");
  // A completion retry retrieves an existing sale; later restrictions must not hide it.
  if (cart.completed_at) {
    if (options.allowCompleted !== false) return;
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This cart is already completed.");
  }
  if (!getStripeConnectConfiguration()) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Stripe test checkout is not configured.");
  }
  if (cart.currency_code !== "usd") {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Checkout currently supports USD only.");
  }
  if (cart.shipping_address?.country_code !== "us") {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Checkout currently supports shipping within the United States only.");
  }
  if (!cart.items?.length) throw new MedusaError(MedusaError.Types.INVALID_DATA, "The cart is empty.");

  const sellerIds = new Set<string>();
  for (const item of cart.items) {
    const sellerId = item?.offer?.seller_id;
    if (typeof sellerId !== "string" || !sellerId.trim()) unavailable();
    sellerIds.add(sellerId);
  }
  const { data: sellers } = await query.graph({
    entity: "seller",
    fields: ["id", "status", "payout_account.id", "payout_account.status", "payout_account.data"],
    filters: { id: [...sellerIds] },
  }, { cache: { enable: false } });
  const readySellers = new Set<string>();
  for (const seller of sellers) {
    if (!sellerIds.has(seller.id)) unavailable();
    const account = seller.payout_account;
    const data = stripeAccountData.safeParse(account?.data);
    if (
      seller.status !== SellerStatus.OPEN || !account?.id ||
      account.status !== PayoutAccountStatus.ACTIVE || !data.success ||
      data.data.metadata.account_id !== account.id
    ) unavailable();
    readySellers.add(seller.id);
  }
  if (readySellers.size !== sellerIds.size) unavailable();
}

/** Root may call this before the native store payment-session creation route. */
export async function assertPaymentCollectionSellersReadyForSale(
  container: MedusaContainer, paymentCollectionId: string,
): Promise<void> {
  if (!paymentCollectionId?.trim()) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "A payment collection is required.");
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: links } = await query.graph({
    entity: "cart_payment_collection", fields: ["cart_id"],
    filters: { payment_collection_id: paymentCollectionId },
  }, { cache: { enable: false } });
  if (links.length !== 1 || !links[0].cart_id) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "A checkout cart is required for this payment collection.");
  }
  await assertCartSellersReadyForSale(container, links[0].cart_id, { allowCompleted: false });
}
