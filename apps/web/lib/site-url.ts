type SiteEnvironment = {
  NEXT_PUBLIC_SITE_URL?: string
  RAILWAY_PUBLIC_DOMAIN?: string
}

export function getSiteUrl(
  environment: SiteEnvironment = {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    RAILWAY_PUBLIC_DOMAIN: process.env.RAILWAY_PUBLIC_DOMAIN,
  },
): URL {
  const configuredUrl = environment.NEXT_PUBLIC_SITE_URL?.trim()
  const railwayDomain = environment.RAILWAY_PUBLIC_DOMAIN?.trim()
  const url = new URL(
    configuredUrl ||
      (railwayDomain ? `https://${railwayDomain}` : "http://localhost:3000"),
  )

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL must be an HTTP(S) origin without credentials, a path, query or fragment",
    )
  }

  return url
}
