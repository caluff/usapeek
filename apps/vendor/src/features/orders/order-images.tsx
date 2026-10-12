import { Suspense, use } from "react";
import { ProductThumbnail } from "@/components/ui/product-thumbnail";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  OrderImageItem,
  ProductThumbnails,
  orderImageItems,
} from "./image-data";

export function OrderItemThumbnail({
  item,
  products,
  className,
}: {
  item?: OrderImageItem;
  products?: Promise<ProductThumbnails>;
  className?: string;
}) {
  if (item?.thumbnail || !item?.product_id || !products)
    return (
      <ProductThumbnail
        src={item?.thumbnail}
        alt={item?.title}
        className={className}
      />
    );
  return (
    <Suspense
      fallback={
        <Skeleton
          data-slot="thumbnail"
          className={`size-12 shrink-0 rounded-md ${className ?? ""}`}
          aria-label={`Cargando imagen de ${item.title}`}
        />
      }
    >
      <ResolvedItemThumbnail
        item={item}
        products={products}
        className={className}
      />
    </Suspense>
  );
}

function ResolvedItemThumbnail({
  item,
  products,
  className,
}: {
  item: OrderImageItem;
  products: Promise<ProductThumbnails>;
  className?: string;
}) {
  const thumbnails = use(products);
  return (
    <ProductThumbnail
      src={item.product_id ? thumbnails.get(item.product_id) : undefined}
      alt={item.title}
      className={className}
    />
  );
}

export function OrderImages({
  items = [],
  products,
}: {
  items?: readonly OrderImageItem[];
  products?: Promise<ProductThumbnails>;
}) {
  return (
    <div className="flex w-fit items-center gap-1.5">
      {items.length ? (
        items
          .slice(0, 3)
          .map((item) => (
            <OrderItemThumbnail key={item.id} item={item} products={products} />
          ))
      ) : (
        <ProductThumbnail />
      )}
      {items.length > 3 ? (
        <span
          className="text-xs font-medium tabular-nums text-muted-foreground"
          aria-label={`${items.length - 3} artículos más`}
        >
          +{items.length - 3}
        </span>
      ) : null}
    </div>
  );
}

export async function LoadedOrderImages({
  orderId,
  result,
}: {
  orderId: string;
  result: ReturnType<typeof orderImageItems>;
}) {
  const { orders, products } = await result;
  return (
    <OrderImages
      items={orders.find((order) => order.id === orderId)?.items}
      products={products}
    />
  );
}
