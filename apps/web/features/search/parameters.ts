export const SEARCH_PAGE_SIZE = 24;

export const SEARCH_SORT_OPTIONS = [
  { value: "relevance", label: "Relevancia" },
  { value: "price_asc", label: "Precio: menor a mayor" },
  { value: "price_desc", label: "Precio: mayor a menor" },
  { value: "newest", label: "Novedades" },
] as const;

export type SearchSort = (typeof SEARCH_SORT_OPTIONS)[number]["value"];
export type SearchParameters = ReturnType<typeof parseSearchParameters>;
export type SearchUrlParameters = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function ids(value: string | string[] | undefined) {
  return [
    ...new Set(
      (Array.isArray(value) ? value : value ? [value] : [])
        .map((entry) => entry.trim())
        .filter((entry) => /^[a-zA-Z0-9_-]{1,128}$/.test(entry)),
    ),
  ].slice(0, 20);
}

function amount(value: string | string[] | undefined) {
  const input = first(value)?.trim();
  if (!input || !/^\d+(\.\d{1,2})?$/.test(input)) return undefined;
  const parsed = Number(input);
  return Number.isFinite(parsed) && parsed <= 1_000_000_000
    ? parsed
    : undefined;
}

export function parseSearchParameters(parameters: SearchUrlParameters) {
  const requestedSort = first(parameters.sort);
  const sort: SearchSort =
    SEARCH_SORT_OPTIONS.find((entry) => entry.value === requestedSort)?.value ??
    "relevance";
  const page = Number(first(parameters.page));
  let minPrice = amount(parameters.min_price);
  let maxPrice = amount(parameters.max_price);
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    [minPrice, maxPrice] = [maxPrice, minPrice];
  }
  return {
    q: (first(parameters.q) ?? "").trim().replace(/\s+/g, " ").slice(0, 200),
    categoryIds: ids(parameters.category_id),
    sellerIds: ids(parameters.seller_id),
    minPrice,
    maxPrice,
    sort,
    page: Number.isSafeInteger(page) && page > 0 ? Math.min(page, 1000) : 1,
  };
}

export function searchHref(parameters: SearchParameters) {
  const query = new URLSearchParams();
  if (parameters.q) query.set("q", parameters.q);
  for (const id of parameters.categoryIds) query.append("category_id", id);
  for (const id of parameters.sellerIds) query.append("seller_id", id);
  if (parameters.minPrice !== undefined)
    query.set("min_price", String(parameters.minPrice));
  if (parameters.maxPrice !== undefined)
    query.set("max_price", String(parameters.maxPrice));
  if (parameters.sort !== "relevance") query.set("sort", parameters.sort);
  if (parameters.page > 1) query.set("page", String(parameters.page));
  return `/search${query.size ? `?${query}` : ""}`;
}

export function clearSearchFilters(
  parameters: SearchParameters,
): SearchParameters {
  return {
    ...parameters,
    categoryIds: [],
    sellerIds: [],
    minPrice: undefined,
    maxPrice: undefined,
    page: 1,
  };
}

export function getSearchPagination(
  parameters: SearchParameters,
  pages: number,
) {
  const lastPage = Math.max(1, pages);
  const isOutOfRange = parameters.page > lastPage;
  return {
    lastPage,
    isOutOfRange,
    recoveryHref: searchHref({ ...parameters, page: lastPage }),
    previousHref:
      !isOutOfRange && parameters.page > 1
        ? searchHref({ ...parameters, page: parameters.page - 1 })
        : null,
    nextHref:
      parameters.page < lastPage
        ? searchHref({ ...parameters, page: parameters.page + 1 })
        : null,
  };
}
