export type CatalogFailureStatus =
  | "backend_unavailable"
  | "request_timeout"
  | "network_error"
  | "key_rejected"
  | "store_api_error"

export class StorefrontTimeoutError extends Error {
  constructor() {
    super("The Store API request timed out")
    this.name = "StorefrontTimeoutError"
  }
}

type ErrorRecord = {
  name?: unknown
  status?: unknown
  code?: unknown
  cause?: unknown
}

function asErrorRecord(value: unknown): ErrorRecord | null {
  return typeof value === "object" && value !== null
    ? (value as ErrorRecord)
    : null
}

function findErrorCode(error: unknown): string | undefined {
  let current = asErrorRecord(error)

  for (let depth = 0; current && depth < 3; depth += 1) {
    if (typeof current.code === "string") {
      return current.code
    }

    current = asErrorRecord(current.cause)
  }

  return undefined
}

export function classifyCatalogError(error: unknown): CatalogFailureStatus {
  const record = asErrorRecord(error)
  const status = typeof record?.status === "number" ? record.status : undefined

  if (status === 401 || status === 403) {
    return "key_rejected"
  }

  if (status !== undefined) {
    return "store_api_error"
  }

  if (
    error instanceof StorefrontTimeoutError ||
    record?.name === "AbortError" ||
    record?.name === "TimeoutError"
  ) {
    return "request_timeout"
  }

  const code = findErrorCode(error)

  if (code === "ECONNREFUSED") {
    return "backend_unavailable"
  }

  if (
    code === "ETIMEDOUT" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "UND_ERR_HEADERS_TIMEOUT"
  ) {
    return "request_timeout"
  }

  if (
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN" ||
    code === "ECONNRESET" ||
    code === "UND_ERR_SOCKET" ||
    error instanceof TypeError
  ) {
    return "network_error"
  }

  return "store_api_error"
}

export function getCatalogContentStatus(
  products: readonly unknown[],
): "empty" | "products" {
  return products.length === 0 ? "empty" : "products"
}

export function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController()
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      const error = new StorefrontTimeoutError()
      controller.abort(error)
      reject(error)
    }, timeoutMs)

    Promise.resolve()
      .then(() => operation(controller.signal))
      .then(
        (value) => {
          clearTimeout(timeout)
          resolve(value)
        },
        (error: unknown) => {
          clearTimeout(timeout)
          reject(error)
        },
      )
  })
}
