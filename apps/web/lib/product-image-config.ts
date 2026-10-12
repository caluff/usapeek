export function productImagePattern(value: string | undefined) {
  if (!value) return null
  try {
    const url = new URL(value)
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      /[*{}?\[\]()!|+\\]/.test(url.hostname + url.pathname) ||
      url.pathname === "/"
    )
      return null
    return {
      protocol: "https" as const,
      hostname: url.hostname,
      port: url.port,
      pathname: `${url.pathname.replace(/\/+$/, "")}/**`,
      search: "",
    }
  } catch {
    return null
  }
}

export function isOptimizableProductImage(
  source: URL,
  publicImageUrl: string | undefined,
) {
  const pattern = productImagePattern(publicImageUrl)
  return Boolean(
    pattern &&
    source.protocol === "https:" &&
    !source.username &&
    !source.password &&
    source.hostname === pattern.hostname &&
    source.port === pattern.port &&
    !source.search &&
    !source.hash &&
    source.pathname.startsWith(pattern.pathname.slice(0, -2)),
  )
}
