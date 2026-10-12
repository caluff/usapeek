export function sellerApplicationUrl(
  value = process.env.NEXT_PUBLIC_STOREFRONT_URL,
  production = process.env.NODE_ENV === "production",
) {
  const configured =
    value?.trim() || (production ? "" : "http://localhost:3000");
  try {
    const url = new URL(configured);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (production && url.protocol !== "https:")
    )
      return null;
    return new URL("/account/sell", url.origin).toString();
  } catch {
    return null;
  }
}
