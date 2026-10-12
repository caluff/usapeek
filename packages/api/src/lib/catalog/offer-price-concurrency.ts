import { MedusaError } from "@medusajs/framework/utils";
import type { UpsertOfferPriceDTO } from "@mercurjs/types";

type PriceRule = { attribute?: string; value?: string };
export type OfferPriceSnapshot = {
  id?: string;
  amount?: number;
  currency_code?: string;
  min_quantity?: number | null;
  max_quantity?: number | null;
  price_rules?: PriceRule[];
};

export type OfferPriceUpdateSnapshot = {
  id: string;
  seller_id: string;
  sku: string;
  shipping_profile_id: string;
  prices?: OfferPriceSnapshot[] | null;
};

export type ConcurrentOfferPriceInput = {
  seller_id: string;
  offer_id: string;
  amount: number;
  expected_amount: number | null;
  sku: string;
  expected_sku: string;
  shipping_profile_id: string;
  expected_shipping_profile_id: string;
};

const conflict = (message: string): never => {
  throw new MedusaError(MedusaError.Types.CONFLICT, message);
};

const invalid = (message: string): never => {
  throw new MedusaError(MedusaError.Types.INVALID_DATA, message);
};

function baseUsdPrice(prices: OfferPriceSnapshot[]) {
  const candidates = prices.filter(
    (price) =>
      price.currency_code === "usd" &&
      price.min_quantity == null &&
      price.max_quantity == null &&
      Array.isArray(price.price_rules) &&
      price.price_rules.every((rule) => rule.attribute === "offer_id"),
  );
  if (candidates.length > 1)
    invalid(
      "La oferta tiene varios precios base USD. Revisa la oferta antes de editarla.",
    );
  return candidates[0];
}

export function prepareConcurrentOfferPriceUpdate(
  offer: OfferPriceUpdateSnapshot,
  input: ConcurrentOfferPriceInput,
) {
  if (offer.seller_id !== input.seller_id)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "La oferta no pertenece a esta tienda.",
    );
  if (offer.sku !== input.expected_sku)
    conflict(
      "El SKU cambió desde que abriste la página. Recarga antes de volver a guardar.",
    );
  if (offer.shipping_profile_id !== input.expected_shipping_profile_id)
    conflict(
      "El perfil de envío cambió desde que abriste la página. Recarga antes de volver a guardar.",
    );

  const rawPrices = offer.prices;
  if (!Array.isArray(rawPrices))
    invalid("No se recibió la lista completa de precios.");
  const prices = rawPrices as OfferPriceSnapshot[];
  const completePrices = prices.filter((price): price is OfferPriceSnapshot => price != null);
  if (completePrices.length !== prices.length)
    invalid("No se recibieron todos los datos del precio. Recarga la oferta.");
  const base = baseUsdPrice(completePrices);
  const currentAmount = base ? Number(base.amount) : null;
  if (currentAmount !== input.expected_amount)
    conflict(
      "El precio cambió desde que abriste la página. Recarga antes de volver a guardar.",
    );

  const replacement: UpsertOfferPriceDTO[] = completePrices.map((price) => {
    const id = price.id;
    const rules = price.price_rules;
    if (typeof id !== "string" || !id || !Array.isArray(rules))
      invalid("No se recibieron todos los datos del precio. Recarga la oferta.");
    const validId = id as string;
    const validRules = rules as PriceRule[];
    const amount = price.amount;
    const currencyCode = price.currency_code;
    if (
      typeof amount !== "number" ||
      !Number.isFinite(amount) ||
      typeof currencyCode !== "string" ||
      validRules.some(
        (rule) => !rule.attribute || rule.value == null,
      )
    )
      invalid("La oferta contiene un precio inválido.");
    return {
      id: validId,
      amount: validId === base?.id ? input.amount : (amount as number),
      currency_code: currencyCode as string,
      min_quantity: price.min_quantity ?? null,
      max_quantity: price.max_quantity ?? null,
      rules: Object.fromEntries(
        validRules.map((rule) => [rule.attribute!, rule.value!]),
      ),
    };
  });
  if (!base)
    replacement.push({
      amount: input.amount,
      currency_code: "usd",
      min_quantity: null,
      max_quantity: null,
      rules: {},
    });

  return {
    id: offer.id,
    sku: input.sku,
    shipping_profile_id: input.shipping_profile_id,
    prices: replacement,
  };
}
