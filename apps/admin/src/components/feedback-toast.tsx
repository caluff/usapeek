"use client";

import { useEffect, useRef } from "react";
import { notifyFeedback, type Feedback } from "@/lib/feedback";

export function FeedbackToast({ status, message }: Feedback) {
  const previous = useRef<string | null>(null);
  useEffect(() => {
    const key = `${status}:${message ?? ""}`;
    if (previous.current === key) return;
    previous.current = key;
    notifyFeedback({ status, message });
  }, [status, message]);
  return null;
}
