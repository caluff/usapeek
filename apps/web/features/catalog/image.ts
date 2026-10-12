import { isOptimizableProductImage } from "@/lib/product-image-config"

export function getProductImage(source: string | null | undefined) {
  if (!source) {
    return null
  }

  if (/^\/(?!\/)/.test(source)) {
    return { source, unoptimized: false }
  }

  try {
    const url = new URL(source)

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null
    }

    let configuredBackendOrigin: string | null = null

    try {
      configuredBackendOrigin = new URL(
        process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "",
      ).origin
    } catch {
      // Invalid public configuration is rendered by the catalog state. Images
      // simply skip optimization if this component is reused independently.
    }

    return {
      source: url.toString(),
      unoptimized:
        !(
          url.protocol === "https:" && url.origin === configuredBackendOrigin
        ) &&
        !isOptimizableProductImage(
          url,
          process.env.NEXT_PUBLIC_PRODUCT_IMAGE_URL,
        ),
    }
  } catch {
    return null
  }
}
