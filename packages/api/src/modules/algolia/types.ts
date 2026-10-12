export const SHARED_CATALOG_SCOPE = "__shared_catalog__";

export type AlgoliaProduct = {
  objectID: string;
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  tags: string[];
  categories: string[];
  category_ids: string[];
  seller_ids: string[];
  seller_scope: string;
  lower_price_seller_ids: string[];
  sales_channel_ids: string[];
  region_id: string;
  currency_code: string;
  price: number;
  created_at: number;
};

export type SearchSort = "relevance" | "price_asc" | "price_desc" | "newest";
