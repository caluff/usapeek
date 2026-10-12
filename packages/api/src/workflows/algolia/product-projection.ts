import type { MedusaContainer } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils";
import { resolveVisibleSellerIds } from "@mercurjs/core/api/utils/sellers";
import type { AlgoliaProduct } from "../../modules/algolia/types";
import { SHARED_CATALOG_SCOPE } from "../../modules/algolia/types";
import { parseISO } from "date-fns/parseISO";

export async function searchRegion(container: MedusaContainer) {
  const { data: regions } = await container
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph({
      entity: "region",
      fields: ["id", "currency_code", "countries.iso_2"],
      filters: { countries: { iso_2: "us" } },
    });
  const region = regions[0];
  if (!region)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Search requires the storefront's United States region.",
    );
  return region;
}

export async function projectSearchProducts(
  container: MedusaContainer,
  ids: string[],
): Promise<AlgoliaProduct[]> {
  if (!ids.length) return [];
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const [region, visibleSellerIds, { data: products }] = await Promise.all([
    searchRegion(container),
    resolveVisibleSellerIds(container),
    query.graph({
      entity: "product",
      fields: [
        "id",
        "title",
        "subtitle",
        "description",
        "created_at",
        "tags.value",
        "categories.id",
        "categories.name",
        "categories.is_active",
        "categories.is_internal",
        "sales_channels.id",
      ],
      filters: { id: ids, status: "published" },
    }),
  ]);
  if (!visibleSellerIds.length || !products.length) return [];
  const { data: offers } = await query.graph({
    entity: "offer",
    fields: ["id", "product_id", "seller_id", "product_variant.price_set.id"],
    filters: {
      product_id: products.map((product) => product.id),
      seller_id: visibleSellerIds,
    },
  });
  const pricing = container.resolve(Modules.PRICING);
  const offersByProduct = new Map<
    string,
    Array<{ sellerId: string; amount: number }>
  >();
  // Offer-specific rules are native Mercur pricing rules. Never fall back to an
  // arbitrary variant price or copy price-list/customer-specific rules to Algolia.
  for (let start = 0; start < offers.length; start += 8) {
    await Promise.all(
      offers.slice(start, start + 8).map(async (offer) => {
        const priceSetId = offer.product_variant?.price_set?.id;
        if (!priceSetId) return;
        const [price] = await pricing.calculatePrices(
          { id: [priceSetId] },
          {
            context: {
              region_id: region.id,
              currency_code: region.currency_code,
              country_code: "us",
              quantity: 1,
              offer_id: offer.id,
            },
          },
        );
        if (price?.calculated_amount == null) return;
        const amount = Number(price.calculated_amount);
        if (!Number.isFinite(amount) || amount < 0) return;
        const existing = offersByProduct.get(offer.product_id) ?? [];
        existing.push({ sellerId: offer.seller_id, amount });
        offersByProduct.set(offer.product_id, existing);
      }),
    );
  }
  return products.flatMap((product): AlgoliaProduct[] => {
    const productOffers = offersByProduct.get(product.id);
    if (!productOffers?.length) return [];
    const categories = (product.categories ?? []).filter(
      (category) => category && category.is_active && !category.is_internal,
    );
    const base: AlgoliaProduct = {
      objectID: `${product.id}:all`,
      id: product.id,
      title: product.title,
      subtitle: product.subtitle,
      description: product.description,
      tags: (product.tags ?? []).flatMap((tag) => (tag ? [tag.value] : [])),
      category_ids: categories.map((category) => category!.id),
      categories: categories.map((category) => category!.name),
      seller_ids: [...new Set(productOffers.map((offer) => offer.sellerId))],
      seller_scope: "all",
      lower_price_seller_ids: [],
      sales_channel_ids: product.sales_channels?.length
        ? product.sales_channels.flatMap((channel) =>
            channel ? [channel.id] : [],
          )
        : [SHARED_CATALOG_SCOPE],
      region_id: region.id,
      currency_code: region.currency_code,
      price: Math.min(...productOffers.map((offer) => offer.amount)),
      created_at: (product.created_at instanceof Date
        ? product.created_at
        : parseISO(product.created_at)
      ).getTime(),
    };
    const sellerPrices = base.seller_ids
      .map((sellerId) => ({
        sellerId,
        price: Math.min(
          ...productOffers
            .filter((offer) => offer.sellerId === sellerId)
            .map((offer) => offer.amount),
        ),
      }))
      .sort((a, b) => a.price - b.price || (a.sellerId < b.sellerId ? -1 : 1));
    // Excluding predecessors among the selected stores leaves exactly their
    // cheapest scope per product, even for equal prices and descending sorting.
    return [
      base,
      ...sellerPrices.map(({ sellerId, price }, index) => ({
        ...base,
        objectID: `${product.id}:${sellerId}`,
        seller_ids: [sellerId],
        seller_scope: sellerId,
        lower_price_seller_ids: sellerPrices
          .slice(0, index)
          .map((seller) => seller.sellerId),
        price,
      })),
    ];
  });
}
