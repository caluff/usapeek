"use client"

import { Thumbnail } from "@usapeek/ui/thumbnail"
import Image, { type ImageProps } from "next/image"
import { getProductImage } from "@/features/catalog/image"

export function ProductThumbnail({
  src,
  alt = "",
  className,
  sizes = "48px",
  loading = "lazy",
}: {
  src?: string | null
  alt?: string
  className?: string
  sizes?: string
  loading?: ImageProps["loading"]
}) {
  const image = getProductImage(src)

  return (
    <Thumbnail src={image?.source} alt={alt} className={className}>
      {image ? (
        <Image
          src={image.source}
          alt={alt}
          fill
          sizes={sizes}
          loading={loading}
          unoptimized={image.unoptimized}
          className="object-contain"
        />
      ) : null}
    </Thumbnail>
  )
}
