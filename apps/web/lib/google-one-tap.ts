export const ONE_TAP_COOKIE = "mv2_web_google_one_tap"
export const ONE_TAP_MAX_AGE = 10 * 60

export function oneTapCookieName(nonce: unknown) {
  return typeof nonce === "string" && /^[A-Za-z0-9_-]{43}$/.test(nonce)
    ? `${ONE_TAP_COOKIE}_${nonce}`
    : null
}

export function consumeOneTapTransaction(
  store: {
    get: (name: string) => { value: string } | undefined
    delete: (name: string) => unknown
  },
  nonce: unknown,
) {
  const name = oneTapCookieName(nonce)
  if (!name) return undefined
  const transaction = store.get(name)?.value
  store.delete(name)
  return transaction
}

export function isOneTapCredential(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 8192 &&
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)
  )
}
