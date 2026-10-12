import Image from "next/image";
import Link from "next/link";
import { Thumbnail } from "@usapeek/ui/thumbnail";
import type { InventoryItemWithLevels } from "./data";
import { inventoryProducts } from "./presentation";

export function InventoryProduct({ item }: { item: InventoryItemWithLevels }) {
  const products = inventoryProducts(item);
  if (!products.length)
    return (
      <div>
        <p className="font-semibold">{item.title || "Artículo sin nombre"}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Sin producto vinculado
        </p>
      </div>
    );
  return (
    <div className="space-y-3">
      {products.map((product, index) => (
        <Link
          key={`${product.id}:${index}`}
          href={`/seller/catalog/${product.id}`}
          className="flex w-fit items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Thumbnail src={product.thumbnail}>
            {product.thumbnail ? (
              <Image
                src={product.thumbnail}
                alt=""
                width={48}
                height={48}
                unoptimized
              />
            ) : null}
          </Thumbnail>
          <span className="min-w-0">
            <span className="block font-semibold">{product.title}</span>
            {product.presentation ? (
              <span className="mt-1 block text-xs text-muted-foreground">
                {product.presentation}
              </span>
            ) : null}
          </span>
        </Link>
      ))}
    </div>
  );
}
