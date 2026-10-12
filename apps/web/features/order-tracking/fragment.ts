export function isOrderTrackingToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 2048 &&
    !/[^a-zA-Z0-9._-]/.test(value)
  )
}

export function parseOrderTrackingFragment(fragment: unknown) {
  if (typeof fragment !== "string" || !fragment.startsWith("#token=")) {
    return null
  }
  const token = fragment.slice("#token=".length)
  return isOrderTrackingToken(token) ? token : null
}
