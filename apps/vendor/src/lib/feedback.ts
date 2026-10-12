import { toast } from "sonner";

export type Feedback = { status: string; message?: string };

export function notifyFeedback(feedback: Feedback | null) {
  if (!feedback?.message || feedback.status === "idle") return;
  const notify = feedback.status === "success"
    ? toast.success
    : feedback.status === "error"
      ? toast.error
      : ["warning", "conflict", "verification_required", "mfa_required"].includes(feedback.status)
        ? toast.warning
        : toast.info;
  return notify(feedback.message);
}
