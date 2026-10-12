export type AccountActionState = {
  status: "idle" | "success" | "error"
  message?: string
  fieldErrors?: Record<string, string>
  values?: Record<string, string>
}

export const INITIAL_ACCOUNT_STATE: AccountActionState = { status: "idle" }
