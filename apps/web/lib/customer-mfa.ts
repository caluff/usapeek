export async function completeCustomerMfa({
  verifyChallenge,
  setSession,
  clearChallenge,
}: {
  verifyChallenge: () => Promise<string>
  setSession: (token: string) => Promise<void>
  clearChallenge: () => Promise<void>
}) {
  let token: string
  try {
    token = await verifyChallenge()
  } catch {
    return "invalid_code" as const
  }

  try {
    await setSession(token)
    return "complete" as const
  } catch {
    // The native MFA challenge has already been consumed. Start a fresh login.
    await clearChallenge()
    return "session_unavailable" as const
  }
}
