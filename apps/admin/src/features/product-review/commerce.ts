import type { PriceDTO } from "@medusajs/types";
import { ProductChangeActionType } from "@mercurjs/types";
import type {
  OfferDTO,
  OfferPriceDTO,
  ProductDTO,
  SellerDTO,
} from "@mercurjs/types";

export type ReviewPrice = Pick<
  OfferPriceDTO,
  "amount" | "currency_code" | "min_quantity" | "max_quantity"
> &
  Pick<PriceDTO, "price_rules">;

export type ReviewOffer = Pick<OfferDTO, "id" | "variant_id" | "seller_id"> & {
  seller?: Pick<SellerDTO, "id" | "name">;
  prices?: ReviewPrice[];
};

export type ReviewCommerce = {
  offers: ReviewOffer[] | null;
  sellers: Pick<SellerDTO, "id" | "name">[] | null;
};

export function productCreatorId(product: Pick<ProductDTO, "changes">) {
  return product.changes?.find((change) =>
    change.actions?.some(
      (action) => action.action === ProductChangeActionType.PRODUCT_ADD,
    ),
  )?.created_by;
}

export function reviewPriceLabels(offers: ReviewOffer[]) {
  const amountsByCurrency = new Map<string, number[]>();
  for (const offer of offers) {
    for (const price of offer.prices ?? []) {
      const amount = Number(price.amount);
      if (
        price.amount == null ||
        !Number.isFinite(amount) ||
        amount < 0 ||
        !price.currency_code ||
        !/^[a-z]{3}$/i.test(price.currency_code) ||
        price.min_quantity != null ||
        price.max_quantity != null ||
        !Array.isArray(price.price_rules) ||
        price.price_rules.some((rule) => rule.attribute !== "offer_id")
      )
        continue;
      const currency = price.currency_code.toUpperCase();
      const amounts = amountsByCurrency.get(currency) ?? [];
      amounts.push(amount);
      amountsByCurrency.set(currency, amounts);
    }
  }
  return [...amountsByCurrency]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amounts]) => {
      const format = new Intl.NumberFormat("es-UY", {
        style: "currency",
        currency,
      });
      const min = Math.min(...amounts);
      const max = Math.max(...amounts);
      return min === max
        ? format.format(min)
        : `${format.format(min)} – ${format.format(max)}`;
    });
}

export function reviewCommerceSummary(
  product: Pick<ProductDTO, "changes" | "variants">,
  commerce: ReviewCommerce,
) {
  const variantIds = new Set(product.variants?.map((variant) => variant.id));
  const offers = commerce.offers?.filter((offer) =>
    variantIds.has(offer.variant_id),
  );
  const creatorId = productCreatorId(product);
  const creator =
    commerce.sellers?.find((seller) => seller.id === creatorId) ??
    offers?.find((offer) => offer.seller?.id === creatorId)?.seller;
  if (creatorId && commerce.sellers === null && !creator) {
    return { store: "No disponible", stores: [], prices: null };
  }
  const stores = creator
    ? [creator]
    : [
        ...new Map(
          offers?.flatMap((offer) =>
            offer.seller?.id && offer.seller.name
              ? [[offer.seller.id, offer.seller] as const]
              : [],
          ),
        ).values(),
      ];
  return {
    stores,
    store: stores.length
      ? stores.map((seller) => seller.name).join(", ")
      : commerce.offers === null || (creatorId && commerce.sellers === null)
        ? "No disponible"
        : "Catálogo compartido",
    prices: offers
      ? reviewPriceLabels(
          creator
            ? offers.filter((offer) => offer.seller_id === creator.id)
            : offers,
        )
      : null,
  };
}
