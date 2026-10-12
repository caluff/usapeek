import type { HttpTypes } from "@medusajs/types";
import { Suspense } from "react";
import { ProductThumbnail } from "@/components/ui/product-thumbnail";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAdminSdk } from "@/lib/auth-sdk";
import { ORDER_FIELDS, orderItemImage, orderProductImages } from "./data";

export function OrderItemImage({
  item,
  images,
}: {
  item: HttpTypes.AdminOrderLineItem;
  images: Promise<Map<string, string>>;
}) {
  const src = orderItemImage(item);
  return src ? (
    <ProductThumbnail src={src} alt={item.title} />
  ) : (
    <Suspense
      fallback={
        <Skeleton data-slot="thumbnail" className="size-12 shrink-0 rounded-md" />
      }
    >
      <ResolvedItemImage item={item} images={images} />
    </Suspense>
  );
}

async function ResolvedItemImage({
  item,
  images,
}: {
  item: HttpTypes.AdminOrderLineItem;
  images: Promise<Map<string, string>>;
}) {
  const src = item.product_id ? (await images).get(item.product_id) : null;
  return <ProductThumbnail src={src} alt={item.title} />;
}

export function OrderImages({
  items,
  images,
}: {
  items: HttpTypes.AdminOrderLineItem[] | undefined;
  images: Promise<Map<string, string>>;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {items?.length ? (
        items
          .slice(0, 3)
          .map((item) => (
            <OrderItemImage key={item.id} item={item} images={images} />
          ))
      ) : (
        <ProductThumbnail />
      )}
      {(items?.length ?? 0) > 3 ? (
        <span
          className="px-1 text-xs text-muted-foreground"
          title={`${items!.length - 3} productos más`}
        >
          +{items!.length - 3}
        </span>
      ) : null}
    </div>
  );
}

export async function loadReportOrderImages(ids: string[]) {
  const sdk = await requireAdminSdk();
  try {
    const { orders } = await sdk.admin.order.list({
      id: ids,
      limit: ids.length,
      fields: ORDER_FIELDS,
    });
    return {
      orders: new Map(orders.map((order) => [order.id, order])),
      images: orderProductImages(sdk, orders),
    };
  } catch {
    return null;
  }
}

export async function ReportOrderImages({
  id,
  data,
}: {
  id: string;
  data: ReturnType<typeof loadReportOrderImages>;
}) {
  const result = await data;
  if (!result) return <ProductThumbnail />;
  return (
    <OrderImages items={result.orders.get(id)?.items} images={result.images} />
  );
}
