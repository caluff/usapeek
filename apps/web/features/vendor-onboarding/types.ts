import type { ApplicationResponse } from "@usapeek/vendor-onboarding-contracts"

export type ApplicationActionResult = {
  status: "success" | "error" | "conflict"
  message: string
  response?: ApplicationResponse
  fieldErrors?: Record<string, string>
  retryable?: boolean
}

export type Feedback = {
  status: "success" | "error"
  message: string
  retryAfterSeconds?: number
}
