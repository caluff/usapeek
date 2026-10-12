const TOKEN_UNAVAILABLE_MESSAGE =
  "[GSI_LOGGER]: FedCM get() rejects with NetworkError: Error retrieving a token."
const DIAGNOSTICS_INSTALLED = Symbol.for("usapeek.google-one-tap.diagnostics")

type DiagnosticConsole = Pick<Console, "error" | "warn">
type DiagnosticError = Console["error"] & {
  [DIAGNOSTICS_INSTALLED]?: true
}

export function installGoogleOneTapDevDiagnostics(logger: DiagnosticConsole) {
  const originalError = logger.error as DiagnosticError
  if (originalError[DIAGNOSTICS_INSTALLED]) return

  // GIS can log after the prompt unmounts. Keep this exact diagnostic visible
  // as a warning for the page's lifetime, without registering a Next dev issue.
  const reportError = (...args: unknown[]) => {
    if (args.length === 1 && args[0] === TOKEN_UNAVAILABLE_MESSAGE) {
      logger.warn(...args)
      return
    }
    originalError.apply(logger, args)
  }
  Object.defineProperty(reportError, DIAGNOSTICS_INSTALLED, { value: true })
  logger.error = reportError
}
