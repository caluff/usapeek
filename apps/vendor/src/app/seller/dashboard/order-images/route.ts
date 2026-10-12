import type { HttpTypes } from "@mercurjs/types";
import {
  DASHBOARD_HEADERS,
  dashboardReadError,
  vendorDashboardSdk,
} from "@/lib/vendor-dashboard-sdk";

export async function GET(request: Request) {
  const context = await vendorDashboardSdk(request);
  if (context instanceof Response) return context;
  const ids = [...new Set(new URL(request.url).searchParams.getAll("id"))];
  if (
    !ids.length ||
    ids.length > 15 ||
    ids.some((id) => !/^[a-zA-Z0-9_-]{1,128}$/.test(id))
  )
    return new Response(null, { status: 400, headers: DASHBOARD_HEADERS });
  try {
    const { products } =
      await context.sdk.client.fetch<HttpTypes.VendorProductListResponse>(
        "/vendor/products",
        {
          query: {
            id: ids,
            limit: ids.length,
            fields: "id,thumbnail,images.url",
          },
          headers: { "x-seller-id": context.sellerId },
          cache: "no-store",
          signal: AbortSignal.any([
            request.signal,
            AbortSignal.timeout(10_000),
          ]),
        },
      );
    return Response.json(
      Object.fromEntries(
        products.flatMap((product) => {
          const src = product.thumbnail || product.images?.[0]?.url;
          return src ? [[product.id, src]] : [];
        }),
      ),
      { headers: DASHBOARD_HEADERS },
    );
  } catch (error) {
    return dashboardReadError(error);
  }
}
