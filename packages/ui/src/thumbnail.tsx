"use client";

import { ImageIcon } from "lucide-react";
import { Slot } from "radix-ui";
import { useState, type ReactNode } from "react";
import { cn } from "./utils";

function isImageSource(src: string | null | undefined) {
  if (!src) return false;
  if (src.startsWith("/") && !src.startsWith("//")) return true;
  try {
    const url = new URL(src);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function Thumbnail({
  src,
  alt = "",
  className,
  children,
}: {
  src?: string | null;
  alt?: string;
  className?: string;
  children?: ReactNode;
}) {
  const [failedSource, setFailedSource] = useState<string | null>();
  const hasImage = isImageSource(src) && failedSource !== src && children;
  const fallbackLabel = alt ? `Sin imagen: ${alt}` : "Sin imagen";

  return (
    <span
      data-slot="thumbnail"
      className={cn(
        "relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10",
        className,
      )}
    >
      {hasImage ? (
        <Slot.Root
          className="size-full object-contain"
          onError={() => setFailedSource(src)}
        >
          {children}
        </Slot.Root>
      ) : (
        <span role="img" aria-label={fallbackLabel} title={fallbackLabel}>
          <ImageIcon
            className="size-5 text-muted-foreground"
            aria-hidden="true"
          />
        </span>
      )}
    </span>
  );
}

export { Thumbnail };
