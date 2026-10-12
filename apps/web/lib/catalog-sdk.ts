import Medusa from "@medusajs/js-sdk"

// Each deadline owns its SDK transport. Never mutate a shared SDK's signal:
// aborting one request must not cancel another visitor's operation.
export function createCatalogSdk(
  config: { baseUrl: string; publishableKey: string },
  signal: AbortSignal,
) {
  const sdk = new Medusa({
    ...config,
    debug: false,
    auth: { type: "jwt", jwtTokenStorageMethod: "nostore" },
  })
  const transport = sdk.client.fetch_
  sdk.client.fetch_ = (input, init) => {
    signal.throwIfAborted()
    return transport(input, {
      ...init,
      cache: "no-store",
      signal: init?.signal ? AbortSignal.any([signal, init.signal]) : signal,
    })
  }
  return sdk
}
