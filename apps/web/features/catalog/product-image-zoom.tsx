"use client"

import Image from "next/image"
import { useEffect, useRef, useState, type PointerEvent } from "react"
import { DialogTrigger } from "@/components/ui/dialog"
import { getProductImageZoom } from "./product-image-zoom-geometry"

export function ProductImageZoom({
  title,
  images,
  selectedIndex,
}: {
  title: string
  images: { source: string; unoptimized: boolean }[]
  selectedIndex: number
}) {
  const { source, unoptimized } = images[selectedIndex]
  const imageRef = useRef<HTMLImageElement>(null)
  const lensRef = useRef<HTMLSpanElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef<HTMLDivElement>(null)
  const [zoomedSource, setZoomedSource] = useState<string | null>(null)
  const isZoomVisible = zoomedSource === source

  useEffect(() => {
    const hideZoom = () => setZoomedSource(null)
    window.addEventListener("resize", hideZoom)
    window.addEventListener("scroll", hideZoom, true)
    return () => {
      window.removeEventListener("resize", hideZoom)
      window.removeEventListener("scroll", hideZoom, true)
    }
  }, [])

  function updateZoom(event: PointerEvent<HTMLButtonElement>) {
    const image = imageRef.current
    const lens = lensRef.current
    const preview = previewRef.current
    const zoom = zoomRef.current
    if (!image || !lens || !preview || !zoom) return
    if (
      event.pointerType !== "mouse" ||
      !window.matchMedia(
        "(min-width: 1024px) and (hover: hover) and (pointer: fine)",
      ).matches
    ) {
      setZoomedSource(null)
      return
    }

    const bounds = event.currentTarget.getBoundingClientRect()
    const contentRight =
      event.currentTarget.closest("article")?.getBoundingClientRect().right ??
      window.innerWidth - 24
    const geometry = getProductImageZoom({
      width: bounds.width,
      height: bounds.height,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      pointerX: event.clientX - bounds.left,
      pointerY: event.clientY - bounds.top,
      availableWidth: contentRight - bounds.right - 24,
    })
    if (!geometry) {
      setZoomedSource(null)
      return
    }

    // Update only the magnifier layers; pointer movement need not rerender the gallery.
    lens.style.width = `${geometry.lensWidth}px`
    lens.style.height = `${geometry.lensHeight}px`
    lens.style.transform = `translate(${geometry.lensLeft}px, ${geometry.lensTop}px)`
    preview.style.width = `${geometry.previewWidth}px`
    preview.style.height = `${geometry.previewHeight}px`
    zoom.style.width = `${geometry.zoomWidth}px`
    zoom.style.height = `${geometry.zoomHeight}px`
    zoom.style.transform = `translate(${geometry.zoomLeft}px, ${geometry.zoomTop}px)`
    setZoomedSource(source)
  }

  return (
    <>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`Ampliar imagen de ${title}`}
          onPointerEnter={updateZoom}
          onPointerMove={updateZoom}
          onPointerLeave={() => setZoomedSource(null)}
          onPointerDown={() => setZoomedSource(null)}
          onBlur={() => setZoomedSource(null)}
          className="absolute inset-0 overflow-hidden cursor-zoom-in outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <div
            className="absolute inset-0 flex flex-col transition-transform duration-[var(--motion-medium)] ease-[var(--ease-out)] motion-reduce:transition-none"
            style={{ transform: `translateY(-${selectedIndex * 100}%)` }}
          >
            {images.map((image, index) => (
              <div
                key={image.source}
                className="relative h-full shrink-0 overflow-hidden"
                aria-hidden={selectedIndex !== index}
              >
                <Image
                  ref={selectedIndex === index ? imageRef : undefined}
                  src={image.source}
                  alt={title}
                  fill
                  sizes="(max-width: 767px) 100vw, (max-width: 1023px) 50vw, (max-width: 1440px) 40vw, 520px"
                  unoptimized={image.unoptimized}
                  className="object-contain"
                  preload={index === 0}
                  loading={index === 0 ? undefined : "lazy"}
                />
              </div>
            ))}
          </div>
          <span
            ref={lensRef}
            hidden={!isZoomVisible}
            aria-hidden="true"
            className="pointer-events-none absolute top-0 left-0 border border-brand-accent/60 bg-brand-accent/15"
          />
        </button>
      </DialogTrigger>
      <div
        ref={previewRef}
        hidden={!isZoomVisible}
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-[calc(100%+1.5rem)] z-30 overflow-hidden bg-background shadow-xl max-lg:hidden"
      >
        <div ref={zoomRef} className="absolute top-0 left-0">
          <Image
            src={source}
            alt=""
            fill
            sizes="1560px"
            loading="lazy"
            unoptimized={unoptimized}
            className="object-contain"
          />
        </div>
      </div>
    </>
  )
}
