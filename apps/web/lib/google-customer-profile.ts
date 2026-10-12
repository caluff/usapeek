export type GoogleCustomerProfile = {
  name: string | null
  picture: string | null
}

const profileText = (value: unknown) =>
  typeof value === "string" ? value.trim() : ""

function googlePicture(value: unknown): string | null {
  try {
    const url = new URL(profileText(value))
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      (url.hostname === "googleusercontent.com" ||
        url.hostname.endsWith(".googleusercontent.com"))
      ? url.toString()
      : null
  } catch {
    return null
  }
}

// Presentation only: the caller must authenticate this same session with
// customer.retrieve before using its native provider metadata.
export function readGoogleCustomerProfile(
  token: string | undefined,
  customerId: string,
): GoogleCustomerProfile | null {
  if (!token) return null
  try {
    const claims: unknown = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
    )
    if (
      !claims ||
      typeof claims !== "object" ||
      !("actor_type" in claims) ||
      claims.actor_type !== "customer" ||
      !("actor_id" in claims) ||
      claims.actor_id !== customerId ||
      !("auth_provider" in claims) ||
      claims.auth_provider !== "google" ||
      !("user_metadata" in claims) ||
      !claims.user_metadata ||
      typeof claims.user_metadata !== "object"
    )
      return null

    const metadata = claims.user_metadata
    const name =
      ("name" in metadata && profileText(metadata.name)) ||
      [
        "given_name" in metadata && profileText(metadata.given_name),
        "family_name" in metadata && profileText(metadata.family_name),
      ]
        .filter(Boolean)
        .join(" ") ||
      null
    return {
      name,
      picture: "picture" in metadata ? googlePicture(metadata.picture) : null,
    }
  } catch {
    return null
  }
}
