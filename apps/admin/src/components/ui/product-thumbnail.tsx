"use client";

import Image from "next/image";
import { Thumbnail } from "@usapeek/ui/thumbnail";

export function ProductThumbnail({
  src,
  alt = "",
  className,
}: {
  src?: string | null;
  alt?: string;
  className?: string;
}) {
  return (
    <Thumbnail src={src} alt={alt} className={className}>
      {src ? (
        <Image src={src} alt={alt} width={48} height={48} unoptimized />
      ) : null}
    </Thumbnail>
  );
}
