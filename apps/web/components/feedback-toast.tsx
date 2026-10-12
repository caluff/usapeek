"use client"

import { useEffect, useRef } from "react"
import { toast } from "sonner"

type Feedback = { status: string; message?: string }

// Object identity distinguishes repeated attempts with the same server message.
export function useFeedbackToast(feedback: Feedback | null) {
  const lastFeedback = useRef<Feedback | null>(null)
  useEffect(() => {
    if (!feedback?.message || lastFeedback.current === feedback) return
    lastFeedback.current = feedback
    const notify =
      feedback.status === "success"
        ? toast.success
        : feedback.status === "error"
          ? toast.error
          : feedback.status === "warning" || feedback.status === "conflict"
            ? toast.warning
            : toast.info
    notify(feedback.message)
  }, [feedback])
}

export function FeedbackToast({ feedback }: { feedback: Feedback | null }) {
  useFeedbackToast(feedback)
  return null
}
