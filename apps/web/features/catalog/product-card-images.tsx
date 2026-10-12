"use client"

import { ChevronLeft, ChevronRight, ImageIcon } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { getProductImage } from "./image"

export function ProductCardImages({
  title,
  href,
  sources,
}: {
  title: string
  href: string
  sources: string[]
}) {
  const [activeIndex, setActiveIndex] = useState(0)
  const image = getProductImage(sources[activeIndex])
  const hasMultipleImages = sources.length > 1

  function moveImage(direction: -1 | 1) {
    setActiveIndex(
      (index) => (index + direction + sources.length) % sources.length,
    )
  }

  const arrowClassName =
    "absolute top-1/2 size-11 -translate-y-1/2 border-0 bg-background/75 text-foreground hover:bg-background/90 transition-[opacity,scale,background-color,color,border-color,box-shadow] duration-[var(--motion-fast)] motion-reduce:transition-none [@media(hover:hover)_and_(pointer:fine)]:pointer-events-none [@media(hover:hover)_and_(pointer:fine)]:opacity-0 group-hover/card-gallery:pointer-events-auto group-hover/card-gallery:opacity-100 group-focus-within/card-gallery:pointer-events-auto group-focus-within/card-gallery:opacity-100"

  return (
    <div
      className="group/card-gallery absolute inset-0 overflow-hidden"
      role={hasMultipleImages ? "group" : undefined}
      aria-label={hasMultipleImages ? `Imágenes de ${title}` : undefined}
      onKeyDown={(event) => {
        if (!hasMultipleImages) return
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault()
          moveImage(event.key === "ArrowLeft" ? -1 : 1)
        }
      }}
    >
      <Link
        href={href}
        aria-label={`Ver ${title}`}
        className="absolute inset-0 outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {image ? (
          <div
            className="flex h-full transition-transform duration-[var(--motion-medium)] ease-[var(--ease-out)] motion-reduce:transition-none"
            style={{ transform: `translateX(-${activeIndex * 100}%)` }}
          >
            {sources.map((source, index) => {
              const slide = getProductImage(source)
              return slide ? (
                <div
                  key={source}
                  className="relative h-full min-w-0 shrink-0 basis-full overflow-hidden"
                  aria-hidden={index !== activeIndex}
                >
                  <Image
                    src={slide.source}
                    alt={
                      hasMultipleImages
                        ? `${title}, imagen ${index + 1}`
                        : title
                    }
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    loading="lazy"
                    unoptimized={slide.unoptimized}
                    className="object-cover transition-transform duration-[var(--motion-fast)] group-hover/card-gallery:scale-[1.025] motion-reduce:transform-none motion-reduce:transition-none"
                  />
                </div>
              ) : null
            })}
          </div>
        ) : (
          <div className="grid h-full place-items-center text-muted-foreground">
            <ImageIcon
              aria-hidden="true"
              className="size-10"
              strokeWidth={1.25}
            />
            <span className="sr-only">Este producto no tiene imagen</span>
          </div>
        )}
      </Link>
      {hasMultipleImages ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Imagen anterior de ${title}`}
            className={`${arrowClassName} left-2`}
            onClick={() => moveImage(-1)}
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Imagen siguiente de ${title}`}
            className={`${arrowClassName} right-2`}
            onClick={() => moveImage(1)}
          >
            <ChevronRight className="size-5" aria-hidden="true" />
          </Button>
          <span className="sr-only" aria-live="polite" aria-atomic="true">
            Imagen {activeIndex + 1} de {sources.length}
          </span>
        </>
      ) : null}
    </div>
  )
}
