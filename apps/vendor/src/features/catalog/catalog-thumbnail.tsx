"use client";

import { ProductThumbnail } from "@/components/ui/product-thumbnail";

export function CatalogThumbnail({ src }: { src?: string | null }) {
  return <ProductThumbnail src={src} />;
}
