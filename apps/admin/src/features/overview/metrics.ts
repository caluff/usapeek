import type Medusa from "@medusajs/js-sdk";
import type { HttpTypes as MedusaHttpTypes } from "@medusajs/types";
import type { HttpTypes } from "@mercurjs/types";
import type { AdminApplicationListResponse } from "@usapeek/vendor-onboarding-contracts";
import type { AdminOrderCountResponse } from "@usapeek/api/order-notification-contracts";

export const OVERVIEW_METRICS = [
  {
    id: "applications",
    label: "Solicitudes en revisión",
    href: "/dashboard/vendor-applications?status=submitted",
    action: "Revisar solicitudes",
  },
  {
    id: "products",
    label: "Productos propuestos",
    href: "/dashboard/product-review?status=proposed",
    action: "Revisar productos",
  },
  {
    id: "stores",
    label: "Tiendas",
    href: "/dashboard/stores",
    action: "Ver tiendas",
  },
  {
    id: "orders",
    label: "Pedidos",
    href: "/dashboard/orders",
    action: "Ver pedidos",
  },
] as const;

export type OverviewMetricDefinition = (typeof OVERVIEW_METRICS)[number];

export function parseOverviewMetricId(value: unknown): OverviewMetricDefinition["id"] | null {
  return OVERVIEW_METRICS.find((metric) => metric.id === value)?.id ?? null;
}

export async function readOverviewCount(
  sdk: Medusa,
  id: OverviewMetricDefinition["id"],
  signal?: AbortSignal,
) {
  const query = { limit: 1, offset: 0, fields: "id" };
  switch (id) {
    case "applications":
      return (
        await sdk.client.fetch<AdminApplicationListResponse>(
          "/admin/vendor-applications",
          {
            query: { limit: 1, offset: 0, status: "submitted" },
            cache: "no-store",
            signal,
          },
        )
      ).count;
    case "products":
      // The installed native list method accepts headers only, so bounded reads
      // use the same SDK endpoint with its supported FetchArgs signal.
      if (signal) {
        return (await sdk.client.fetch<MedusaHttpTypes.AdminProductListResponse>(
          "/admin/products",
          { query: { ...query, status: ["proposed"] }, cache: "no-store", signal },
        )).count;
      }
      return (await sdk.admin.product.list({ ...query, status: ["proposed"] }))
        .count;
    case "stores":
      return (
        await sdk.client.fetch<HttpTypes.AdminSellerListResponse>(
          "/admin/sellers",
          {
            query,
            cache: "no-store",
            signal,
          },
        )
      ).count;
    case "orders":
      return (await sdk.client.fetch<AdminOrderCountResponse>(
        "/admin/overview/orders",
        { cache: "no-store", signal },
      )).count;
  }
}
