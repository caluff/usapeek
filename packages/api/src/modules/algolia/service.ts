import {
  algoliasearch,
  type Algoliasearch,
  type IndexSettings,
  type SearchParams,
} from "algoliasearch";
import type { AlgoliaOptions } from "./configuration";
import type { AlgoliaProduct, SearchSort } from "./types";

// Adapted from Mercur's official algolia registry block: the module only owns
// the external search projection. Commerce reads/calculations stay in workflows.
export const defaultProductSettings: IndexSettings = {
  searchableAttributes: [
    "title",
    "subtitle",
    "categories",
    "tags",
    "description",
  ],
  attributesForFaceting: [
    "filterOnly(id)",
    "filterOnly(region_id)",
    "filterOnly(seller_scope)",
    "filterOnly(lower_price_seller_ids)",
    "filterOnly(sales_channel_ids)",
    "category_ids",
    "seller_ids",
    "price",
  ],
  attributesToRetrieve: ["id"],
  attributesToHighlight: [],
  paginationLimitedTo: 1000,
};

export default class AlgoliaModuleService {
  private client: Algoliasearch;
  private options: AlgoliaOptions;

  constructor(_: unknown, options: AlgoliaOptions) {
    this.options = options;
    this.client = algoliasearch(options.appId, options.apiKey);
  }

  indexName(sort: SearchSort = "relevance") {
    return sort === "relevance"
      ? this.options.productIndex
      : `${this.options.productIndex}_${sort}`;
  }

  async configure() {
    const sorts = ["price_asc", "price_desc", "newest"] as const;
    const result = await this.client.setSettings({
      indexName: this.indexName(),
      indexSettings: {
        ...defaultProductSettings,
        replicas: sorts.map((sort) => this.indexName(sort)),
      },
    });
    await this.client.waitForTask({
      indexName: this.indexName(),
      taskID: result.taskID,
    });
    for (const sort of sorts) {
      const ranking =
        sort === "price_asc"
          ? "asc(price)"
          : sort === "price_desc"
            ? "desc(price)"
            : "desc(created_at)";
      const settings = await this.client.setSettings({
        indexName: this.indexName(sort),
        indexSettings: {
          ...defaultProductSettings,
          ranking: [
            ranking,
            "typo",
            "geo",
            "words",
            "filters",
            "proximity",
            "attribute",
            "exact",
            "custom",
          ],
        },
      });
      await this.client.waitForTask({
        indexName: this.indexName(sort),
        taskID: settings.taskID,
      });
    }
  }

  async batch(toAdd: AlgoliaProduct[], toDelete: string[]) {
    if (!toAdd.length && !toDelete.length) return;
    const result = await this.client.batch({
      indexName: this.indexName(),
      batchWriteParams: {
        requests: [
          ...toAdd.map((body) => ({ action: "addObject" as const, body })),
          ...toDelete.map((objectID) => ({
            action: "deleteObject" as const,
            body: { objectID },
          })),
        ],
      },
    });
    await this.client.waitForTask({
      indexName: this.indexName(),
      taskID: result.taskID,
    });
  }

  async reconcile(validIds: Set<string>, productIds?: string[]) {
    if (productIds && !productIds.length) return;
    const obsolete: string[] = [];
    await this.client.browseObjects<{ id: string }>({
      indexName: this.indexName(),
      browseParams: {
        attributesToRetrieve: ["id"],
        hitsPerPage: 1000,
        ...(productIds
          ? {
              filters: productIds
                .map((id) => `id:${JSON.stringify(id)}`)
                .join(" OR "),
            }
          : {}),
      },
      aggregator: (response) => {
        obsolete.push(
          ...response.hits
            .filter((hit) => !validIds.has(hit.objectID))
            .map((hit) => hit.objectID),
        );
      },
    });
    for (let start = 0; start < obsolete.length; start += 1000) {
      await this.batch([], obsolete.slice(start, start + 1000));
    }
  }

  search(params: SearchParams, sort: SearchSort) {
    return this.client.searchSingleIndex<{ id: string }>({
      indexName: this.indexName(sort),
      searchParams: params,
    });
  }
}
