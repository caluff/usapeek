import {
  requireAdminReadSdk,
  adminReadErrorResponse,
} from "@/lib/admin-read-sdk";
import {
  ORDER_FIELDS,
  orderItemImage,
  orderProductImages,
} from "@/features/orders/data";
import { REPORT_PAGE_SIZE } from "@/features/finance-reporting/parameters";
import type { ReportOrderImageData } from "@/features/finance-reporting/order-image-data";

export async function GET(request: Request) {
  try {
    const sdk = await requireAdminReadSdk();
    const ids = [...new Set(new URL(request.url).searchParams.getAll("id"))];
    if (
      !ids.length ||
      ids.length > REPORT_PAGE_SIZE ||
      ids.some((id) => !/^order_[a-z0-9_]{1,240}$/i.test(id))
    )
      return Response.json(
        { message: "Pedidos no válidos." },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    const { orders } = await sdk.admin.order.list({
      id: ids,
      limit: ids.length,
      fields: ORDER_FIELDS,
    });
    const products = await orderProductImages(sdk, orders);
    const images: ReportOrderImageData = Object.fromEntries(
      orders.map((order) => [
        order.id,
        {
          images: (order.items ?? []).slice(0, 3).map((item) => ({
            src:
              orderItemImage(item) ??
              (item.product_id
                ? (products.get(item.product_id) ?? null)
                : null),
            alt: item.title,
          })),
          additional: Math.max(0, (order.items?.length ?? 0) - 3),
        },
      ]),
    );
    return Response.json(images, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return adminReadErrorResponse(error);
  }
}
