import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import {
  PricingEvents,
  ProductCategoryWorkflowEvents,
  ProductWorkflowEvents,
  RegionWorkflowEvents,
  SalesChannelWorkflowEvents,
} from "@medusajs/framework/utils";
import {
  OfferWorkflowEvents,
  SellerWorkflowEvents,
} from "@mercurjs/core/workflows/events";
import { ALGOLIA_MODULE } from "../modules/algolia";
import { syncAlgoliaProductsWorkflow } from "../workflows/algolia/sync-products";

type CatalogEvent = { id?: string | string[]; product_id?: string };

export default async function algoliaCatalogChanged({
  event,
  container,
}: SubscriberArgs<CatalogEvent | CatalogEvent[]>) {
  if (!container.hasRegistration(ALGOLIA_MODULE)) return;
  const entries = Array.isArray(event.data) ? event.data : [event.data];
  let ids: string[] | undefined;
  if (
    Object.values(ProductWorkflowEvents).some((name) => name === event.name)
  ) {
    ids = entries.flatMap((entry) =>
      typeof entry.id === "string" ? [entry.id] : (entry.id ?? []),
    );
  } else if (
    Object.values(OfferWorkflowEvents).includes(event.name) &&
    entries.every((entry) => entry.product_id)
  ) {
    // Mercur's offer workflow events retain product_id even after offer deletion.
    ids = entries.map((entry) => entry.product_id!);
  }
  // Pricing, seller moderation, category and channel changes can affect many
  // products. Rebuild from native current state, using the same Redis workflow.
  await syncAlgoliaProductsWorkflow(container).run({ input: { ids } });
}

export const config: SubscriberConfig = {
  event: [
    ...Object.values(ProductWorkflowEvents),
    ...Object.values(OfferWorkflowEvents),
    ...Object.values(SellerWorkflowEvents),
    ...Object.values(ProductCategoryWorkflowEvents),
    ...Object.values(RegionWorkflowEvents),
    ...Object.values(SalesChannelWorkflowEvents),
    ...Object.values(PricingEvents),
  ],
  context: { subscriberId: "algolia-catalog-changed" },
};
