"use client";

import { useEffect, useRef } from "react";
import { notifyFeedback, type Feedback } from "@/lib/feedback";

export function useFeedbackToast(feedback: Feedback | null) {
  const previous = useRef<Feedback | null>(null);
  useEffect(() => {
    if (!feedback?.message || previous.current === feedback) return;
    previous.current = feedback;
    notifyFeedback(feedback);
  }, [feedback]);
}

export function FeedbackToast({ feedback }: { feedback: Feedback }) {
  useFeedbackToast(feedback);
  return null;
}
