import type { NextConfig } from "next"
import { productImagePattern } from "./lib/product-image-config"

function getServerActionAllowedOrigins() {
  const configured =
    process.env.SERVER_ACTIONS_ALLOWED_ORIGINS?.split(",") ?? []
  const candidates = [
    ...(configured.length ? configured : [process.env.RAILWAY_PUBLIC_DOMAIN]),
    // Orca forwards the local preview to localhost:3000 with a different host.
    process.env.NODE_ENV === "development"
      ? "marketplace-v2.orca.localhost:6136"
      : undefined,
  ]

  return candidates
    .flatMap((candidate) => {
      const value = candidate?.trim()
      if (!value) return []

      try {
        const url = new URL(value.includes("://") ? value : `https://${value}`)
        if (
          !["http:", "https:"].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.pathname !== "/" ||
          url.search ||
          url.hash
        ) {
          return []
        }
        return [url.host]
      } catch {
        return []
      }
    })
    .filter((origin, index, origins) => origins.indexOf(origin) === index)
}

function getBackendImagePatterns() {
  try {
    const backendUrl = new URL(process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "")

    if (backendUrl.protocol !== "https:") {
      return []
    }

    return [
      {
        protocol: "https" as const,
        hostname: backendUrl.hostname,
        port: backendUrl.port,
        pathname: "/**",
      },
    ]
  } catch {
    return []
  }
}

const nextConfig: NextConfig = {
  transpilePackages: ["@usapeek/ui", "@usapeek/order-reference"],
  async headers() {
    return [
      ...(process.env.NODE_ENV === "production"
        ? [
            {
              source: "/:path*",
              has: [
                { type: "header" as const, key: "x-forwarded-proto", value: "https" },
              ],
              headers: [
                { key: "Strict-Transport-Security", value: "max-age=31536000" },
              ],
            },
          ]
        : []),
      {
        source: "/orders/track",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Cache-Control",
            value: "private, no-store, max-age=0, must-revalidate",
          },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet" },
        ],
      },
    ]
  },
  experimental: {
    serverActions: {
      allowedOrigins: getServerActionAllowedOrigins(),
    },
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      ...getBackendImagePatterns(),
      ...[
        productImagePattern(process.env.NEXT_PUBLIC_PRODUCT_IMAGE_URL),
      ].flatMap((pattern) => (pattern ? [pattern] : [])),
    ],
  },
}

export default nextConfig
