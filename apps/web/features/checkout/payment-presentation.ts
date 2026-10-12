import type { HttpTypes } from "@medusajs/types"
import type { Appearance } from "@stripe/stripe-js"

export function paymentBillingDetails(cart: HttpTypes.StoreCart) {
  const address = cart.billing_address ?? cart.shipping_address
  return {
    name: [address?.first_name, address?.last_name].filter(Boolean).join(" "),
    email: cart.email ?? "",
    phone: address?.phone ?? "",
    address: {
      line1: address?.address_1 ?? "",
      line2: address?.address_2 ?? "",
      city: address?.city ?? "",
      state: address?.province ?? "",
      postal_code: address?.postal_code ?? "",
      country: address?.country_code?.toUpperCase() ?? "US",
    },
  }
}

export function storefrontPaymentAppearance(): Appearance {
  const styles = getComputedStyle(document.documentElement)
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = 1
  const context = canvas.getContext("2d")
  const color = (token: string, fallback: string) => {
    const value = styles.getPropertyValue(token).trim()
    if (!context || !value) return fallback
    // Convert the storefront's OKLCH tokens to Stripe-compatible RGB colors.
    context.clearRect(0, 0, 1, 1)
    context.fillStyle = value
    context.fillRect(0, 0, 1, 1)
    const [red, green, blue] = context.getImageData(0, 0, 1, 1).data
    return `rgb(${red}, ${green}, ${blue})`
  }
  const border = color("--border", "#d4d4d4")
  return {
    theme: "stripe",
    variables: {
      colorPrimary: color("--brand-accent", "#7c3aed"),
      colorBackground: color("--card", "#ffffff"),
      colorText: color("--foreground", "#171717"),
      colorTextSecondary: color("--muted-foreground", "#737373"),
      colorTextPlaceholder: color("--muted-foreground", "#737373"),
      colorDanger: color("--destructive", "#b91c1c"),
      fontFamily: getComputedStyle(document.body).fontFamily,
      fontSizeBase: "14px",
      borderRadius: styles.getPropertyValue("--radius").trim() || "0px",
      spacingUnit: "4px",
    },
    rules: {
      ".Input": {
        border: `1px solid ${border}`,
        boxShadow: "none",
        padding: "12px",
      },
      ".Input:focus": {
        borderColor: color("--ring", "#737373"),
        boxShadow: "none",
      },
      ".Tab": { border: `1px solid ${border}`, boxShadow: "none" },
      ".Tab--selected": {
        borderColor: color("--foreground", "#171717"),
        boxShadow: "none",
      },
      ".Block": {
        border: `1px solid ${border}`,
        boxShadow: "none",
        backgroundColor: color("--card", "#ffffff"),
      },
      ".Label": { fontWeight: "500", marginBottom: "6px" },
    },
  }
}
