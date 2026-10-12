import type { HttpTypes } from "@medusajs/framework/types";
export type { StoreSearchProductsInput } from "./validators";

export type SearchFacet = { id: string; label: string; count: number };
export type StoreSearchProductsResponse = {
  products: HttpTypes.StoreProduct[];
  nbHits: number;
  page: number;
  nbPages: number;
  hitsPerPage: number;
  facets: { categories: SearchFacet[]; sellers: SearchFacet[] };
  price_range: { min: number; max: number } | null;
  query: string;
};
