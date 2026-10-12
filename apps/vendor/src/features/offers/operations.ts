import type { PriceDTO } from "@medusajs/types";
import type {
  HttpTypes,
  OfferDTO,
  OfferPriceDTO,
  UpsertOfferPriceDTO,
} from "@mercurjs/types";
import { scopedClient, type AuthorizeVendor } from "../workspace/operations";
import { resourceId, stockQuantity, textField } from "../workspace/validation";
import { usdAmount } from "./price-validation";
export { usdAmount } from "./price-validation";

export type OfferPrice = Pick<
  OfferPriceDTO,
  "id" | "amount" | "currency_code" | "min_quantity" | "max_quantity"
> &
  Pick<PriceDTO, "price_rules">;
export type OfferWithPrices = Omit<OfferDTO, "prices"> & {
  prices?: OfferPrice[];
};
export const OFFER_FIELDS =
  "id,sku,variant_id,shipping_profile_id,prices.id,prices.amount,prices.currency_code,prices.min_quantity,prices.max_quantity,prices.price_rules.attribute,prices.price_rules.value,inventory_items.inventory_item_id";

export function baseUsdPrice(prices: OfferPrice[]) {
  const candidates = prices.filter(
    (price) =>
      price.currency_code === "usd" &&
      price.min_quantity == null &&
      price.max_quantity == null &&
      Array.isArray(price.price_rules) &&
      price.price_rules.every((rule) => rule.attribute === "offer_id"),
  );
  if (candidates.length > 1)
    throw new Error(
      "Hay varios precios base USD. El operador debe revisar esta oferta.",
    );
  return candidates[0];
}
export function replaceBaseUsdPrice(prices: OfferPrice[], amount: number) {
  const base = baseUsdPrice(prices);
  const replacement: UpsertOfferPriceDTO[] = prices.map((price) => {
    if (!price.id || !Array.isArray(price.price_rules))
      throw new Error(
        "No se recibieron todos los datos del precio. Recarga la oferta.",
      );
    const numeric = Number(price.amount);
    if (!Number.isFinite(numeric) || !price.currency_code)
      throw new Error("La oferta contiene un precio inválido.");
    return {
      id: price.id,
      amount: price.id === base?.id ? amount : numeric,
      currency_code: price.currency_code,
      min_quantity:
        price.min_quantity == null ? null : Number(price.min_quantity),
      max_quantity:
        price.max_quantity == null ? null : Number(price.max_quantity),
      rules: Object.fromEntries(
        price.price_rules.map((rule) => [rule.attribute, rule.value]),
      ),
    };
  });
  if (!base)
    replacement.push({
      id: undefined,
      amount,
      currency_code: "usd",
      min_quantity: null,
      max_quantity: null,
      rules: {},
    });
  return replacement;
}

export function offerOperations(authorize: AuthorizeVendor) {
  return {
    async create(form: FormData) {
      const client = scopedClient(await authorize());
      const sku = textField(form, "offer_sku", true, 100);
      const body = {
        variant_id: resourceId(textField(form, "variant_id", true)),
        sku,
        shipping_profile_id: resourceId(
          textField(form, "shipping_profile_id", true),
        ),
        prices: [
          {
            amount: usdAmount(textField(form, "amount", true)),
            currency_code: "usd",
          },
        ],
        inventory_items: [
          {
            sku,
            required_quantity: 1,
            stock_levels: [
              {
                location_id: resourceId(textField(form, "location_id", true)),
                stocked_quantity: stockQuantity(
                  textField(form, "stocked_quantity", true),
                ),
              },
            ],
          },
        ],
      } satisfies HttpTypes.VendorCreateOfferReq;
      return client.post<HttpTypes.VendorOfferResponse>("/vendor/offers", body);
    },
    async update(form: FormData) {
      const client = scopedClient(await authorize());
      const id = resourceId(textField(form, "offer_id", true));
      const amount = usdAmount(textField(form, "amount", true));
      const expected = textField(form, "expected_amount");
      return client.post<HttpTypes.VendorOfferResponse>(
        `/vendor/offers/${id}/price`,
        {
          amount,
          expected_amount: expected ? Number(expected) : null,
          sku: textField(form, "offer_sku", true, 100),
          expected_sku: textField(form, "expected_sku", true, 100),
          shipping_profile_id: textField(form, "shipping_profile_id", true),
          expected_shipping_profile_id: textField(
            form,
            "expected_shipping_profile_id",
            true,
          ),
        },
      );
    },
  };
}
